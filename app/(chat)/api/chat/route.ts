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

export const maxDuration = 60;

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

  // Check short-term
  if (now > userData.shortTermResetTime) {
    userData.shortTermCount = 0;
    userData.shortTermResetTime = now + SHORT_WINDOW_TIME;
  }
  if (userData.shortTermCount >= SHORT_MAX_REQUESTS) {
    return false; // Over short-term limit
  }

  // Check long-term
  if (now > userData.longTermResetTime) {
    userData.longTermCount = 0;
    userData.longTermResetTime = now + LONG_WINDOW_TIME;
  }
  if (userData.longTermCount >= LONG_MAX_REQUESTS) {
    return false; // Over long-term limit
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
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) return null;

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
    messageContent.push({
      type: 'file',
      data: fileArrayBuffer, // raw bytes
      mimeType: fileMime || 'application/octet-stream',
    });
  }

  try {
    // We only destructure "text" from the result
    const { text: initialAnalysis } = await streamText({
      model: geminiAnalysisModel,
      system: 'Analyze the user’s text plus any uploaded file. Extract key concepts.',
      messages: [
        {
          role: 'user',
          content: messageContent,
        },
      ],
    });

    // (Optional) no references to providerMetadata or meta

    return initialAnalysis;
  } catch (err) {
    console.error('Gemini first pass error:', err);
    throw err;
  }
}

/** 
 * Step B: contextEnhancement 
 */
async function enhanceContext(initialAnalysis: string): Promise<string> {
  try {
    const { enhancedContext } = await assistantsEnhancer.enhance(initialAnalysis);
    return enhancedContext;
  } catch (err) {
    console.error('Context enhancement error:', err);
    return initialAnalysis; // fallback
  }
}

/**
 * ================================
 * 3) POST: MULTIPART + 2-PASS AI
 * ================================
 */
export async function POST(request: Request) {
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse "multipart/form-data"
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    return new Response('Invalid form data', { status: 400 });
  }

  // 3. Rate limit
  const userId = session.user.id;
  if (!rateLimiter(userId)) {
    return new Response('Too Many Requests', { status: 429 });
  }

  // 4. Extract "id", "messages", "selectedChatModel"
  const id = formData.get('id')?.toString() || '';
  const messagesStr = formData.get('messages')?.toString() || '';
  const selectedChatModel = formData.get('selectedChatModel')?.toString() || 'default-model';

  // parse messages from JSON
  let messages: Message[] = [];
  try {
    messages = JSON.parse(messagesStr);
  } catch (err) {
    return new Response('Invalid messages JSON', { status: 400 });
  }

  // 5. Possibly get the file
  const file = formData.get('file') as File | null;
  let fileBuffer: ArrayBuffer | undefined;
  let fileMime: string | undefined;
  if (file) {
    fileBuffer = await file.arrayBuffer();
    fileMime = file.type;
    // If you wanted to do a docx/pdf check or extraction, you'd do it here
  }

  // 6. Validate user message
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

  // 7. Check/create chat
  let chat = await getChatById({ id });
  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    chat = await saveChat({ id, userId: session.user.id, title });
  }

  // Save the user’s new message
  await saveMessages({
    messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
  });

  // 8. Return streaming response with multi-pass
  return createDataStreamResponse({
    execute: async (dataStream) => {
      try {
        // Step A: Gemini
        const initialAnalysis = await processInitialQuery(messages, fileBuffer, fileMime);
        if (!initialAnalysis) {
          throw new Error('Gemini returned null');
        }

        // Step B: aggregator
        const enhancedContext = await enhanceContext(initialAnalysis);

        // Step C: final pass
        const finalModel = myProvider.languageModel(selectedChatModel);

        const result = streamText({
          model: finalModel,
          system: ` ${systemPrompt({ selectedChatModel })}\n\nEnhanced Context:\n${enhancedContext}`,
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
            } catch (err) {
              console.error('Failed to save AI messages:', err);
            }
          },
        });

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      } catch (err) {
        console.error('Multi-pass error:', err);

        // fallback
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

/**
 * DELETE Handler (unchanged)
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();
  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });
    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });
    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    console.error('Delete error:', error);
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
