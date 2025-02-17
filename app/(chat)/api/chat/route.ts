// app/(chat)/api/chat/route.ts

import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';
import { NextResponse } from 'next/server';

import { auth } from '@/app/(auth)/auth';
import { myProvider } from '@/lib/ai/models';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from '@/lib/utils';

import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';

// Gemini for the initial pass
import { google } from '@ai-sdk/google';
import type { GoogleGenerativeAIProviderMetadata } from '@ai-sdk/google';

// Your aggregator
import { createAssistantsEnhancer } from '@/lib/ai/enhancers/assistants';

export const maxDuration = 180;

/**
 * ======================================
 * 1) IN-MEMORY RATE LIMIT (2h + 12h)
 * ======================================
 */
type RateLimitInfo = {
  shortTermCount: number;
  shortTermResetTime: number;
  longTermCount: number;
  longTermResetTime: number;
};

const requestsMap = new Map<string, RateLimitInfo>();

// 50 requests in 2 hours
const SHORT_MAX_REQUESTS = 50;
const SHORT_WINDOW_TIME = 2 * 60 * 60_000; // ms

// 100 requests in 12 hours
const LONG_MAX_REQUESTS = 100;
const LONG_WINDOW_TIME = 12 * 60 * 60_000; // ms

function rateLimiter(userId: string): boolean {
  const now = Date.now();
  let userData = requestsMap.get(userId);

  if (!userData) {
    userData = {
      shortTermCount: 0,
      shortTermResetTime: now + SHORT_WINDOW_TIME,
      longTermCount: 0,
      longTermResetTime: now + LONG_WINDOW_TIME,
    };
  }

  // Check short-term window
  if (now > userData.shortTermResetTime) {
    userData.shortTermCount = 0;
    userData.shortTermResetTime = now + SHORT_WINDOW_TIME;
  }
  if (userData.shortTermCount >= SHORT_MAX_REQUESTS) {
    console.log('[rateLimiter] Over short-term limit for user:', userId);
    return false;
  }

  // Check long-term window
  if (now > userData.longTermResetTime) {
    userData.longTermCount = 0;
    userData.longTermResetTime = now + LONG_WINDOW_TIME;
  }
  if (userData.longTermCount >= LONG_MAX_REQUESTS) {
    console.log('[rateLimiter] Over long-term limit for user:', userId);
    return false;
  }

  // Increment usage
  userData.shortTermCount++;
  userData.longTermCount++;
  requestsMap.set(userId, userData);

  return true;
}

/**
 * =========================================
 * 2) MULTI-PASS: GEMINI + ENHANCER + FINAL
 * =========================================
 */

// (A) Gemini model with search grounding ON
const geminiAnalysisModel = google('models/gemini-2.0-flash', {
  useSearchGrounding: true,
});

// (B) aggregator
const assistantsEnhancer = createAssistantsEnhancer(
  process.env.MY_ASSISTANT_ID || 'default-assistant-id'
);

/** 
 * Step A: processInitialQuery with Gemini, optionally reading file bytes 
 */
async function processInitialQuery(
  messages: Message[],
  fileArrayBuffer?: ArrayBuffer,
  fileMime?: string
) {
  console.log('[processInitialQuery] Start');

  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    console.log('[processInitialQuery] No user message found => returning null');
    return null;
  }

  // Build the user "messageContent"
  let messageContent: any[] = [];

  // The user text
  if (typeof userMessage.content === 'string') {
    messageContent.push({ type: 'text', text: userMessage.content });
  } else if (Array.isArray(userMessage.content)) {
    messageContent = userMessage.content;
  }

  // If there's a file, attach it
  if (fileArrayBuffer) {
    console.log('[processInitialQuery] We have a file buffer, attaching it');
    messageContent.push({
      type: 'file',
      data: fileArrayBuffer, // raw bytes
      mimeType: fileMime || 'application/octet-stream',
    });
  }

  try {
    console.log('[processInitialQuery] Calling geminiAnalysisModel with streamText');
    const { text: initialAnalysis } = await streamText({
      model: geminiAnalysisModel,
      system: 'Analyze the user\'s text plus any uploaded file. Extract key concepts.',
      messages: [
        {
          role: 'user',
          content: messageContent,
        },
      ],
    });
    console.log('[processInitialQuery] Gemini call success => got initialAnalysis');
    return initialAnalysis;
  } catch (err) {
    console.error('[processInitialQuery] Gemini first pass error:', err);
    throw err;
  }
}

/** 
 * Step B: contextEnhancement 
 */
async function enhanceContext(initialAnalysis: string): Promise<string> {
  console.log('[enhanceContext] Start');
  try {
    const { enhancedContext } = await assistantsEnhancer.enhance(initialAnalysis);
    console.log('[enhanceContext] aggregator success => got enhancedContext');
    return enhancedContext;
  } catch (err) {
    console.error('[enhanceContext] error =>', err);
    return initialAnalysis; // fallback
  }
}

export async function POST(request: Request) {
  console.log('[POST] Enter route => /api/chat');
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id) {
    console.log('[POST] Unauthorized => returning 401');
    return new Response('Unauthorized', { status: 401 });
  }
  console.log('[POST] Auth success => userId =', session.user.id);

  // 2. Rate limit
  if (!rateLimiter(session.user.id)) {
    console.log('[POST] Rate limit triggered => returning 429');
    return new Response('Too Many Requests', { status: 429 });
  }

  // 3. Parse either FormData or JSON
  console.log('[POST] Checking content-type =>', request.headers.get('content-type'));
  let id = '';
  let messages: Message[] = [];
  let selectedChatModel = 'default-model';
  let file: File | null = null;

  if (request.headers.get('content-type')?.includes('application/json')) {
    console.log('[POST] => Found JSON body, parsing...');
    try {
      const json = await request.json();
      id = json.id;
      messages = json.messages;
      selectedChatModel = json.selectedChatModel || 'default-model';
      console.log('[POST] JSON parse success =>', {
        id,
        selectedChatModel,
        messagesCount: messages?.length,
      });
    } catch (err) {
      console.error('[POST] Invalid JSON =>', err);
      return new Response('Invalid JSON', { status: 400 });
    }
  } else {
    console.log('[POST] => No JSON => Attempting formData parse...');
    try {
      const formData = await request.formData();
      id = formData.get('id')?.toString() || '';
      const messagesStr = formData.get('messages')?.toString() || '';
      selectedChatModel = formData.get('selectedChatModel')?.toString() || 'default-model';
      file = formData.get('file') as File | null;

      console.log('[POST] formData =>', {
        id,
        selectedChatModel,
        hasFile: !!file,
      });

      try {
        messages = JSON.parse(messagesStr);
        console.log('[POST] Parsed messages from formData => count:', messages?.length);
      } catch (err) {
        console.error('[POST] Invalid messages JSON in formData =>', err);
        return new Response('Invalid messages JSON', { status: 400 });
      }
    } catch (err) {
      console.error('[POST] Invalid form data =>', err);
      return new Response('Invalid form data', { status: 400 });
    }
  }

  // Process file if present
  let fileBuffer: ArrayBuffer | undefined;
  let fileMime: string | undefined;
  if (file) {
    console.log('[POST] file found => converting to arrayBuffer');
    fileBuffer = await file.arrayBuffer();
    fileMime = file.type;
  }

  // 4. Validate user message
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    console.log('[POST] No user message found => returning 400');
    return new Response('No user message found', { status: 400 });
  }

  // 5. Check if chat exists; if not, create
  console.log('[POST] Checking chat => id:', id);
  const chat = await getChatById({ id });
  if (!chat) {
    console.log('[POST] No existing chat => creating new');
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  // 6. Save the user's new message
  console.log('[POST] Saving user message to DB');
  await saveMessages({
    messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
  });

  console.log('[POST] About to return createDataStreamResponse => multi-pass logic');

  return createDataStreamResponse({
    execute: async (dataStream) => {
      try {
        console.log('[EXECUTE] Step A => processInitialQuery');
        const initialAnalysis = await processInitialQuery(messages, fileBuffer, fileMime);
        if (!initialAnalysis) {
          throw new Error('Gemini returned null');
        }
        console.log('[EXECUTE] initialAnalysis (first 100 chars)=', initialAnalysis.slice(0, 100), '...');

        // ADDED LOG #1:
        console.log('[EXECUTE] Done with processInitialQuery => now calling enhanceContext');
        const enhancedContext = await enhanceContext(initialAnalysis);
        // ADDED LOG #2:
        console.log('[EXECUTE] aggregator => returned. enhancedContext (first 100 chars)=', enhancedContext.slice(0, 100), '...');

        console.log('[EXECUTE] Step C => final model => streamText');
        const finalModel = myProvider.languageModel(selectedChatModel);

        const result = streamText({
          model: finalModel,
          system: `${systemPrompt({ selectedChatModel })}\n\nEnhanced Context:\n${enhancedContext}`,
          messages,
          maxSteps: 5,
          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : ['getWeather', 'createDocument', 'updateDocument', 'requestSuggestions'],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          onFinish: async ({ response, reasoning }) => {
            console.log('[EXECUTE:onFinish] Final model done => saving AI messages');
            try {
              const sanitized = sanitizeResponseMessages({
                messages: response.messages,
                reasoning,
              });
              await saveMessages({
                messages: sanitized.map((m) => ({
                  id: m.id,
                  chatId: id,
                  role: m.role,
                  content: m.content,
                  createdAt: new Date(),
                })),
              });
              console.log('[EXECUTE:onFinish] Successfully saved AI messages');
            } catch (err) {
              console.error('[EXECUTE:onFinish] Failed to save AI messages =>', err);
            }
          },
        });

        console.log('[EXECUTE] Merging partial results => result.mergeIntoDataStream');
        result.mergeIntoDataStream(dataStream, { sendReasoning: true });
      } catch (err) {
        console.error('[EXECUTE] Multi-pass error =>', err);
        console.log('[EXECUTE] Fallback => finalModel again');

        const fallbackModel = myProvider.languageModel(selectedChatModel);
        const fallbackResult = streamText({
          model: fallbackModel,
          system: systemPrompt({ selectedChatModel }),
          messages,
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
        });
        fallbackResult.mergeIntoDataStream(dataStream, { sendReasoning: true });
      }
    },
    onError: () => 'Oops, an error occurred!',
  });
}

export async function DELETE(request: Request) {
  console.log('[DELETE] /api/chat => deleting chat');
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    console.log('[DELETE] No id found => returning 404');
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();
  if (!session || !session.user) {
    console.log('[DELETE] Unauthorized => returning 401');
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    console.log('[DELETE] Checking chat =>', id);
    const chat = await getChatById({ id });
    if (!chat || chat.userId !== session.user.id) {
      console.log('[DELETE] Chat not found or not owned => returning 401');
      return new Response('Unauthorized', { status: 401 });
    }

    console.log('[DELETE] Deleting chat =>', id);
    await deleteChatById({ id });
    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    console.error('[DELETE] Error =>', error);
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
