// app/(chat)/api/chat/route.ts

import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
  generateText,
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

// Google provider + aggregator
import { google } from '@ai-sdk/google';
import { createAssistantsEnhancer } from '@/lib/ai/enhancers/assistants';

export const maxDuration = 180;

/**
 * 1) IN-MEMORY RATE LIMIT (2h + 12h)
 */
type RateLimitInfo = {
  shortTermCount: number;
  shortTermResetTime: number;
  longTermCount: number;
  longTermResetTime: number;
};

const requestsMap = new Map<string, RateLimitInfo>();

// Short-term: 50 in 2 hours
const SHORT_MAX_REQUESTS = 50;
const SHORT_WINDOW_TIME = 2 * 60 * 60_000;
// Long-term: 100 in 12 hours
const LONG_MAX_REQUESTS = 100;
const LONG_WINDOW_TIME = 12 * 60 * 60_000;

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

  // short-term window
  if (now > userData.shortTermResetTime) {
    userData.shortTermCount = 0;
    userData.shortTermResetTime = now + SHORT_WINDOW_TIME;
  }
  if (userData.shortTermCount >= SHORT_MAX_REQUESTS) {
    console.log('[rateLimiter] Over short-term limit for user:', userId);
    return false;
  }

  // long-term window
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
 * 2) MULTI-PASS: GEMINI + ENHANCER + FINAL
 */

// Create aggregator with the correct Assistant ID
const assistantsEnhancer = createAssistantsEnhancer(
  process.env.OPENAI_ASSISTANT_ID || 'default-assistant-id'
);

/**
 * getInitialAnalysis (non-streaming Gemini pass)
 */
async function getInitialAnalysis(
  messages: Message[],
  fileBuffer?: ArrayBuffer,
  fileMime?: string
): Promise<string> {
  console.log('[getInitialAnalysis] Start');
  const startTime = Date.now();

  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    console.log('[getInitialAnalysis] No user message => returning empty string');
    return '';
  }

  // Build user content
  const contentParts: any[] = [
    {
      type: 'text',
      text: userMessage.content,
    },
  ];

  // If there's a file, attach as file part
  if (fileBuffer) {
    console.log('[getInitialAnalysis] Attaching file part');
    contentParts.push({
      type: 'file',
      data: fileBuffer,
      mimeType: fileMime || 'application/octet-stream',
    });
  }

  try {
    console.log('[getInitialAnalysis] Using generateText => gemini-2.0-flash');
    
    const { text } = await generateText({
      model: google('gemini-2.0-flash', {
        useSearchGrounding: true,
        structuredOutputs: false,
      }),
      system: systemPrompt({ selectedChatModel: 'gemini-2.0-flash' }),
      messages: [
        {
          role: 'user',
          content: contentParts,
        },
      ],
    });

    console.log('[getInitialAnalysis] Success', {
      duration: Date.now() - startTime,
      textLength: text.length
    });
    return text;
  } catch (error) {
    console.error('[getInitialAnalysis] Error:', {
      error,
      duration: Date.now() - startTime,
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

/**
 * enhanceContext => aggregator.enhance with timing
 */
async function enhanceContext(initialAnalysis: string): Promise<string> {
  console.log('[enhanceContext] Start');
  const startTime = Date.now();

  try {
    const { enhancedContext } = await assistantsEnhancer.enhance(initialAnalysis);
    console.log('[enhanceContext] Success', {
      duration: Date.now() - startTime,
      contextLength: enhancedContext.length
    });
    return enhancedContext;
  } catch (err) {
    console.error('[enhanceContext] Error:', {
      error: err,
      duration: Date.now() - startTime,
      errorMessage: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
    return initialAnalysis; // fallback to initial
  }
}

/**
 * 3) POST => Rate-limit + multi-pass + streaming
 */
export async function POST(request: Request) {
  console.log('[POST] Enter => /api/chat');
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id) {
    console.log('[POST] Unauthorized => 401');
    return new Response('Unauthorized', { status: 401 });
  }
  console.log('[POST] userId =', session.user.id);

  // 2. Rate limit
  if (!rateLimiter(session.user.id)) {
    console.log('[POST] rate-limit => 429');
    return new Response('Too Many Requests', { status: 429 });
  }

  // 3. Parse JSON or FormData
  console.log('[POST] Checking content-type =>', request.headers.get('content-type'));

  let id = '';
  let messages: Message[] = [];
  let selectedChatModel = 'default-model';
  let file: File | null = null;

  if (request.headers.get('content-type')?.includes('application/json')) {
    console.log('[POST] => Found JSON body');
    try {
      const json = await request.json();
      id = json.id;
      messages = json.messages;
      selectedChatModel = json.selectedChatModel || 'default-model';

      console.log('[POST] JSON parse =>', { id, selectedChatModel, messagesCount: messages.length });
    } catch (err) {
      console.error('[POST] Invalid JSON =>', err);
      return new Response('Invalid JSON', { status: 400 });
    }
  } else {
    console.log('[POST] => Attempting formData parse...');
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
        console.log('[POST] parsed messages => count:', messages.length);
      } catch (err) {
        console.error('[POST] invalid messages JSON =>', err);
        return new Response('Invalid messages JSON', { status: 400 });
      }
    } catch (err) {
      console.error('[POST] invalid form data =>', err);
      return new Response('Invalid form data', { status: 400 });
    }
  }

  // 4. Validate user message
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    console.log('[POST] no user message => 400');
    return new Response('No user message found', { status: 400 });
  }

  // 5. Check or create chat
  console.log('[POST] checking chat =>', id);
  const chat = await getChatById({ id });
  if (!chat) {
    console.log('[POST] no chat => creating new');
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  // 6. Save user's new message
  console.log('[POST] saving user message => DB');
  await saveMessages({
    messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
  });

  // 7. Possibly read file
  let fileBuffer: ArrayBuffer | undefined;
  let fileMime: string | undefined;
  if (file) {
    console.log('[POST] file found => read as arrayBuffer');
    fileBuffer = await file.arrayBuffer();
    fileMime = file.type;
  }

  console.log('[POST] => createDataStreamResponse => multi-pass');
  return createDataStreamResponse({
    execute: async (dataStream) => {
      try {
        // Step A: Gemini non-streaming
        console.log('[EXECUTE] Step A => getInitialAnalysis');
        const initialAnalysis = await getInitialAnalysis(messages, fileBuffer, fileMime);
        console.log('[EXECUTE] initialAnalysis length =>', initialAnalysis.length);

        // Step B: aggregator
        console.log('[EXECUTE] Step B => aggregator => enhanceContext');
        const enhancedContext = await enhanceContext(initialAnalysis);
        console.log('[EXECUTE] enhancedContext => first 100 chars:', enhancedContext.slice(0, 100));

        // Step C: final streaming pass
        console.log('[EXECUTE] Step C => final => streaming text');
        const finalModel = myProvider.languageModel(selectedChatModel);

        let streamStartTime = Date.now();
        let lastChunkTime = Date.now();
        let chunkCount = 0;

        try {
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
            onStreamPartReceived: (chunk) => {
              const now = Date.now();
              chunkCount++;
              console.log('[EXECUTE:stream] Chunk received:', {
                chunkNumber: chunkCount,
                chunkLength: typeof chunk === 'string' ? chunk.length : 'non-text chunk',
                timeSinceLastChunk: now - lastChunkTime,
                totalStreamTime: now - streamStartTime
              });
              lastChunkTime = now;
            },
            experimental_generateMessageId: generateUUID,
            tools: {
              getWeather,
              createDocument: createDocument({ session, dataStream }),
              updateDocument: updateDocument({ session, dataStream }),
              requestSuggestions: requestSuggestions({ session, dataStream }),
            },
            onError: (streamError) => {
              console.error('[EXECUTE:stream] Streaming error:', {
                error: streamError,
                totalChunks: chunkCount,
                totalTime: Date.now() - streamStartTime,
                timeSinceLastChunk: Date.now() - lastChunkTime
              });
              return 'The response was interrupted. Please try again.';
            },
            onFinish: async ({ response, reasoning }) => {
              console.log('[EXECUTE:onFinish] Stream completed', {
                totalChunks: chunkCount,
                totalTime: Date.now() - streamStartTime
              });
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
                console.log('[EXECUTE:onFinish] Messages saved successfully');
              } catch (err) {
                console.error('[EXECUTE:onFinish] Failed to save messages:', err);
              }
            },
          });

          console.log('[EXECUTE] Merging stream into dataStream');
          await result.mergeIntoDataStream(dataStream, { sendReasoning: true });
          console.log('[EXECUTE] Stream merge completed successfully');

        } catch (streamError) {
          console.error('[EXECUTE] Fatal streaming error:', {
            error: streamError,
            message: streamError instanceof Error ? streamError.message : String(streamError),
            stack: streamError instanceof Error ? streamError.stack : undefined,
            totalChunks: chunkCount,
            totalTime: Date.now() - streamStartTime,
            timeSinceLastChunk: Date.now() - lastChunkTime
          });
          
          // Try to send a final error message through the stream
          try {
            const errorResult = streamText({
              model: finalModel,
              system: systemPrompt({ selectedChatModel }),
              messages: [{ role: 'user', content: 'The previous response was interrupted. Please try again.' }],
              experimental_transform: smoothStream({ chunking: 'word' }),
              experimental_generateMessageId: generateUUID,
            });
            await errorResult.mergeIntoDataStream(dataStream, { sendReasoning: true });
          } catch (recoveryError) {
            console.error('[EXECUTE] Failed to send error message:', recoveryError);
            throw recoveryError;
          }
        }
        } catch (err) {
        console.error('[EXECUTE] multi-pass error:', {
          error: err,
          errorMessage: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          phase: 'multi-pass',
          modelUsed: selectedChatModel
        });
        
        // Try fallback
        try {
          console.log('[EXECUTE] attempting fallback model');
          const fallbackModel = myProvider.languageModel(selectedChatModel);
          const fallbackResult = streamText({
            model: fallbackModel,
            system: systemPrompt({ selectedChatModel }),
            messages,
            experimental_transform: smoothStream({ chunking: 'word' }),
            experimental_generateMessageId: generateUUID,
          });
          await fallbackResult.mergeIntoDataStream(dataStream, { sendReasoning: true });
        } catch (fallbackError) {
          console.error('[EXECUTE] Fallback attempt failed:', fallbackError);
          throw fallbackError;
        }
      }
    },
    onError: (error) => {
      console.error('[createDataStreamResponse] Final error handler:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return 'Something went wrong. Please try again.';
    },
  });
}

/**
 * DELETE handler
 */
export async function DELETE(request: Request) {
  console.log('[DELETE] => /api/chat');
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    console.log('[DELETE] no id => 404');
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();
  if (!session?.user) {
    console.log('[DELETE] unauthorized => 401');
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    console.log('[DELETE] Checking chat =>', id);
    const chat = await getChatById({ id });
    if (!chat || chat.userId !== session.user.id) {
      console.log('[DELETE] not found/owned => 401');
      return new Response('Unauthorized', { status: 401 });
    }

    console.log('[DELETE] Deleting =>', id);
    await deleteChatById({ id });
    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    console.error('[DELETE] Error =>', error);
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
