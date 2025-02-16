import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';
import { NextResponse } from 'next/server';

import { z } from 'zod';

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

// Gemini for the first pass
import { google } from '@ai-sdk/google';
import type { GoogleGenerativeAIProviderMetadata } from '@ai-sdk/google';

// Aggregator (assistantsEnhancer)
import { createAssistantsEnhancer } from '@/lib/ai/enhancers/assistants';

/**
 * ================================
 * In-Memory Rate Limit (2 + 12 hr)
 * ================================
 */
type RateLimitInfo = {
  shortTermCount: number;
  shortTermResetTime: number;
  longTermCount: number;
  longTermResetTime: number;
};

const requestsMap = new Map<string, RateLimitInfo>();

const SHORT_MAX_REQUESTS = 50;
const SHORT_WINDOW_TIME = 2 * 60 * 60_000; // 2 hours
const LONG_MAX_REQUESTS = 100;
const LONG_WINDOW_TIME = 12 * 60 * 60_000; // 12 hours

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

  if (now > userData.shortTermResetTime) {
    userData.shortTermCount = 0;
    userData.shortTermResetTime = now + SHORT_WINDOW_TIME;
  }
  if (userData.shortTermCount >= SHORT_MAX_REQUESTS) {
    return false;
  }

  if (now > userData.longTermResetTime) {
    userData.longTermCount = 0;
    userData.longTermResetTime = now + LONG_WINDOW_TIME;
  }
  if (userData.longTermCount >= LONG_MAX_REQUESTS) {
    return false;
  }

  userData.shortTermCount++;
  userData.longTermCount++;
  requestsMap.set(userId, userData);

  return true;
}

/**
 * =====================
 * 2-PASS MODELS
 * =====================
 */
const geminiAnalysisModel = google('models/gemini-2.0-flash', {
  useSearchGrounding: true,
});

const assistantsEnhancer = createAssistantsEnhancer(
  process.env.MY_ASSISTANT_ID || 'default-assistant-id'
);

/**
 * If you want to allow docx, pdf, xlsx, csv, images up to 10 MB
 */
const acceptedMimeTypes = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
  'text/csv',
];

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: 'File size should be less than 10MB',
    })
    .refine((file) => acceptedMimeTypes.includes(file.type), {
      message: `Unsupported file type. Allowed: ${acceptedMimeTypes.join(', ')}`,
    }),
});

/**
 * Step A: Gemini first pass
 */
async function processInitialQuery(
  messages: Message[],
  fileArrayBuffer?: ArrayBuffer,
  fileMime?: string
) {
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) return null;

  // Construct the content for Gemini
  let messageContent: any[] = [];
  if (typeof userMessage.content === 'string') {
    messageContent.push({ type: 'text', text: userMessage.content });
  } else if (Array.isArray(userMessage.content)) {
    messageContent = userMessage.content;
  }

  if (fileArrayBuffer) {
    messageContent.push({
      type: 'file',
      data: fileArrayBuffer, // raw bytes
      mimeType: fileMime || 'application/octet-stream',
    });
  }

  try {
    const { text: initialAnalysis, providerMetadata } = await streamText({
      model: geminiAnalysisModel,
      system: 'Analyze the user’s text plus any uploaded file. Extract key concepts.',
      messages: [
        {
          role: 'user',
          content: messageContent,
        },
      ],
    });

    // Optional: log metadata
    const metadata = providerMetadata?.google as GoogleGenerativeAIProviderMetadata | undefined;
    if (metadata?.groundingMetadata) {
      console.log('Gemini search grounding metadata:', JSON.stringify(metadata.groundingMetadata, null, 2));
    }

    return initialAnalysis;
  } catch (err) {
    console.error('Error in Gemini pass:', err);
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
    console.error('Error in context enhancement:', err);
    return initialAnalysis; // fallback
  }
}

export const maxDuration = 60;

/**
 * =============================
 * POST: MULTIPART + TWO-PASS AI
 * =============================
 */
export async function POST(request: Request) {
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse multipart form
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    return new Response('Invalid form data', { status: 400 });
  }

  // 3. Rate limit
  const userId = session.user.id || 'anonymous';
  if (!rateLimiter(userId)) {
    return new Response('Too Many Requests', { status: 429 });
  }

  // We expect hidden fields for "id", "messages", "selectedChatModel"
  const id = formData.get('id')?.toString() || '';
  const messagesStr = formData.get('messages')?.toString() || '';
  const selectedChatModel = formData.get('selectedChatModel')?.toString() || 'default-model';

  if (!messagesStr) {
    return new Response('No messages provided', { status: 400 });
  }

  let messages: Message[];
  try {
    messages = JSON.parse(messagesStr);
  } catch (err) {
    console.error('Invalid messages JSON:', err);
    return new Response('Messages must be valid JSON', { status: 400 });
  }

  // Possibly get the file from formData
  const uploadedFile = formData.get('file') as File | null;
  let fileBuffer: ArrayBuffer | undefined;
  let fileMime: string | undefined;

  if (uploadedFile) {
    // Validate with Zod
    const validatedFile = FileSchema.safeParse({ file: uploadedFile });
    if (!validatedFile.success) {
      const errorMsg = validatedFile.error.errors.map((e) => e.message).join('; ');
      return new Response(errorMsg, { status: 400 });
    }

    fileBuffer = await uploadedFile.arrayBuffer();
    fileMime = uploadedFile.type;
  }

  // 4. Validate user message
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    return new Response('No user message found in messages', { status: 400 });
  }

  // 5. Check or create chat
  let chat = await getChatById({ id });
  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    chat = await saveChat({ id, userId: session.user.id, title });
  }

  // 6. Save user message
  await saveMessages({
    messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
  });

  // 7. Return streaming response (two-pass + final)
  return createDataStreamResponse({
    execute: async (dataStream) => {
      try {
        // STEP A: Gemini
        const initialAnalysis = await processInitialQuery(messages, fileBuffer, fileMime);
        if (!initialAnalysis) {
          throw new Error('Gemini pass returned null/undefined');
        }

        // STEP B: Enhancer
        const enhancedContext = await enhanceContext(initialAnalysis);

        // STEP C: final model
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
            } catch (error) {
              console.error('Failed to save AI messages:', error);
            }
          },
        });

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      } catch (error) {
        console.error('Error in multi-pass flow:', error);
        // Fallback
        const fallbackModel = myProvider.languageModel(selectedChatModel);
        const fallbackResult = streamText({
          model: fallbackModel,
          system: systemPrompt({ selectedChatModel }),
          messages,
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
        });
        fallbackResult.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      }
    },
    onError: () => {
      return 'Oops, an error occurred!';
    },
  });
}

/**
 * DELETE unchanged...
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
