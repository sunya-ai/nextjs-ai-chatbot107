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

// Non-streaming approach with google + generateText
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

// Aggregator (context enhancement)
// Use process.env.OPENAI_ASSISTANT_ID as the parameter for createAssistantsEnhancer:
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
const LONG_WINDOW_TIME = 12 * 60 * 60_000; // ms
const LONG_MAX_REQUESTS = 100;

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

  // short-term
  if (now > userData.shortTermResetTime) {
    userData.shortTermCount = 0;
    userData.shortTermResetTime = now + SHORT_WINDOW_TIME;
  }
  if (userData.shortTermCount >= SHORT_MAX_REQUESTS) {
    console.log('[rateLimiter] Over short-term limit for user:', userId);
    return false;
  }

  // long-term
  if (now > userData.longTermResetTime) {
    userData.longTermCount = 0;
    userData.longTermResetTime = now + LONG_WINDOW_TIME;
  }
  if (userData.longTermCount >= LONG_MAX_REQUESTS) {
    console.log('[rateLimiter] Over long-term limit for user:', userId);
    return false;
  }

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

// aggregator: pass the environment variable used by your updated assistants.ts
const assistantsEnhancer = createAssistantsEnhancer(
  process.env.OPENAI_ASSISTANT_ID || 'default-assistant-id'
);

/** 
 * Non-streaming Gemini initial analysis using generateText.
 */
async function getInitialAnalysis(
  messages: Message[],
  fileBuffer?: ArrayBuffer,
  fileMime?: string
): Promise<string> {
  console.log('[getInitialAnalysis] Start');

  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    console.log('[getInitialAnalysis] No user message => returning empty');
    return '';
  }

  // Build "messages" array for generateText
  let contentParts: any[] = [
    {
      type: 'text',
      text: userMessage.content,
    },
  ];

  if (fileBuffer) {
    console.log('[getInitialAnalysis] We have a file => attaching as "file" part');
    contentParts.push({
      type: 'file',
      data: fileBuffer,
      mimeType: fileMime || 'application/octet-stream',
    });
  }

  try {
    console.log('[getInitialAnalysis] Using "generateText" with google("gemini-2.0-flash")');
    const { text } = await generateText({
      model: google('gemini-2.0-flash', { useSearchGrounding: true }),
      messages: [
        {
          role: 'user',
          content: contentParts,
        },
      ],
    });

    console.log('[getInitialAnalysis] Gemini success => text length:', text.length);
    return text;
  } catch (err) {
    console.error('[getInitialAnalysis] Gemini error =>', err);
    throw err;
  }
}

/** aggregator => aggregator.enhance(...) */
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

  // Optionally read file
  let fileBuffer: ArrayBuffer | undefined;
  let fileMime: string | undefined;
  if (file) {
    console.log('[POST] file found => converting to arrayBuffer');
    fileBuffer = await file.arrayBuffer();
    fileMime = file.type;
  }

  console.log('[POST] About to return createDataStreamResponse => multi-pass logic');

  return createDataStreamResponse({
    execute: async (dataStream) => {
      try {
        // --- Step A: Non-streaming gemini
        console.log('[EXECUTE] Step A => getInitialAnalysis (non-streaming gemini)');
        const initialAnalysis = await getInitialAnalysis(messages, fileBuffer, fileMime);
        console.log('[EXECUTE] initialAnalysis length =>', initialAnalysis.length);

        // --- Step B: aggregator
        console.log('[EXECUTE] Step B => aggregator => enhanceContext');
        const enhancedContext = await enhanceContext(initialAnalysis);
        console.log('[EXECUTE] enhancedContext => first 100 chars:', enhancedContext.slice(0, 100));

        // --- Step C: final streaming
        console.log('[EXECUTE] Step C => final model => streaming pass');
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
            console.log('[EXECUTE:onFinish] final model done => saving AI messages');
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

        console.log('[EXECUTE] Merging partial results => final model');
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
