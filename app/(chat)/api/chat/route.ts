import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';

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

// -- Gemini for the initial analysis
import { google } from '@ai-sdk/google';
import type { GoogleGenerativeAIProviderMetadata } from '@ai-sdk/google';

// -- Your context enhancer from assistants.ts
import { createAssistantsEnhancer } from '@/lib/ai/enhancers/assistants';

export const maxDuration = 60;

/**
 * ========================================================
 * 1) DUAL-WINDOW IN-MEMORY RATE LIMITING (2 hours + 12 hours)
 * ========================================================
 */
type RateLimitInfo = {
  shortTermCount: number;
  shortTermResetTime: number;
  longTermCount: number;
  longTermResetTime: number;
};

const requestsMap = new Map<string, RateLimitInfo>();

// Short-term: 50 requests in 2 hours
const SHORT_MAX_REQUESTS = 50;
const SHORT_WINDOW_TIME = 2 * 60 * 60_000; // 2 hours in ms

// Long-term: 100 requests in 12 hours
const LONG_MAX_REQUESTS = 100;
const LONG_WINDOW_TIME = 12 * 60 * 60_000; // 12 hours in ms

function rateLimiter(userId: string): boolean {
  const now = Date.now();
  let userData = requestsMap.get(userId);

  // If no record yet, initialize
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
    return false; // Over short-term
  }

  // Check long-term window
  if (now > userData.longTermResetTime) {
    userData.longTermCount = 0;
    userData.longTermResetTime = now + LONG_WINDOW_TIME;
  }
  if (userData.longTermCount >= LONG_MAX_REQUESTS) {
    return false; // Over long-term
  }

  // Increment counters
  userData.shortTermCount++;
  userData.longTermCount++;
  requestsMap.set(userId, userData);

  return true;
}

/**
 * =======================================================
 * 2) MULTI-PASS FLOW: GEMINI → ENHANCE → FINAL MODEL
 * =======================================================
 */
// (a) Gemini model for the first pass
const geminiAnalysisModel = google('models/gemini-2.0-flash', {
  useSearchGrounding: true,
});

// (b) Create your assistantsEnhancer from assistants.ts
// Provide the "assistantId" used for the OpenAI Beta endpoints
const assistantsEnhancer = createAssistantsEnhancer(
  process.env.MY_ASSISTANT_ID || 'default-assistant-id'
);

/**
 * First pass: processInitialQuery with Gemini
 */
async function processInitialQuery(messages: Array<Message>, files?: any[]) {
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) return null;

  // Convert user message to array form
  let messageContent: any[] = [];
  if (typeof userMessage.content === 'string') {
    messageContent.push({ type: 'text', text: userMessage.content });
  } else if (Array.isArray(userMessage.content)) {
    messageContent = userMessage.content;
  }

  // Optionally handle files if present
  if (files?.length > 0) {
    for (const file of files) {
      if (file.data) {
        messageContent.push({
          type: 'file',
          data: file.data,
          mimeType: file.mimeType || 'application/octet-stream',
        });
      }
    }
  }

  try {
    const { text: initialAnalysis, providerMetadata } = await streamText({
      model: geminiAnalysisModel,
      system: 'Analyze the user query and any provided files. Extract key concepts.',
      messages: [
        {
          role: 'user',
          content: messageContent,
        },
      ],
    });

    // Log grounding metadata if present
    const metadata = providerMetadata?.google as GoogleGenerativeAIProviderMetadata | undefined;
    if (metadata?.groundingMetadata) {
      console.log('Search grounding metadata:', JSON.stringify(metadata.groundingMetadata, null, 2));
    }

    return initialAnalysis;
  } catch (error) {
    console.error('Error in initial Gemini processing:', error);
    throw error;
  }
}

/**
 * Second pass: Enhance context using your aggregator (assistants.ts)
 */
async function enhanceContext(initialAnalysis: string): Promise<string> {
  try {
    const { enhancedContext } = await assistantsEnhancer.enhance(initialAnalysis);
    return enhancedContext;
  } catch (error) {
    console.error('Error in context enhancement:', error);
    return initialAnalysis; // fallback
  }
}

/**
 * ===================================================
 * 3) POST Handler: Rate Limit + Multi-Pass + Streaming
 * ===================================================
 */
export async function POST(request: Request) {
  const {
    id,
    messages,
    files, // optional, if you handle file attachments
    selectedChatModel,
  }: {
    id: string;
    messages: Array<Message>;
    files?: any[];
    selectedChatModel: string;
  } = await request.json();

  // 1. Auth check
  const session = await auth();
  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Rate limit check
  const userId = session.user.id || request.headers.get('x-forwarded-for') || 'anonymous';
  if (!rateLimiter(userId)) {
    return new Response('Too Many Requests', { status: 429 });
  }

  // 3. Validate user message
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

  // 4. Check or create chat
  const chat = await getChatById({ id });
  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  // 5. Save the user's new message
  await saveMessages({
    messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
  });

  // 6. Multi-pass logic, then streaming response
  return createDataStreamResponse({
    execute: async (dataStream) => {
      try {
        // --- STEP A: Initial Gemini pass ---
        const initialAnalysis = await processInitialQuery(messages, files);
        if (!initialAnalysis) {
          throw new Error('Failed to process initial query');
        }

        // --- STEP B: Enhance context ---
        const enhancedContext = await enhanceContext(initialAnalysis);

        // --- STEP C: Final pass with selected model ---
        const finalModel = myProvider.languageModel(selectedChatModel);

        const result = streamText({
          model: finalModel,
          system: `${systemPrompt({ selectedChatModel })}\n\nEnhanced Context:\n${enhancedContext}`,
          messages,
          maxSteps: 5,
          // Tools from your template
          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : [
                  'getWeather',
                  'createDocument',
                  'updateDocument',
                  'requestSuggestions',
                ],
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
          // Once the response is fully streamed, save it
          onFinish: async ({ response, reasoning }) => {
            try {
              const sanitized = sanitizeResponseMessages({ messages: response.messages, reasoning });
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
              console.error('Failed to save chat:', err);
            }
          },
          experimental_telemetry: {
            isEnabled: true,
            functionId: 'stream-text',
          },
        });

        // Stream partial responses back to the client in real time
        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      } catch (error) {
        console.error('Error in multi-pass processing:', error);

        // Fallback if something in the multi-step fails
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
    onError: () => {
      return 'Oops, an error occurred!';
    },
  });
}

/**
 * =====================================
 * 4) DELETE Handler (unchanged)
 * =====================================
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
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
