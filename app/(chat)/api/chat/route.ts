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
import { generateTitleFromUserMessage } from '@/app/(chat)/actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { inferDomains } from '@/lib/ai/tools/infer-domains'; // For Clearbit logos
import { createAssistantsEnhancer } from '@/lib/ai/enhancers/assistants';
import { google } from '@ai-sdk/google'; // Named import for callable functionality
import { openai } from '@ai-sdk/openai';
import markdownIt from 'markdown-it';
import compromise from 'compromise';

export const maxDuration = 240;

type RateLimitInfo = {
  shortTermCount: number;
  shortTermResetTime: number;
  longTermCount: number;
  longTermResetTime: number;
};

const requestsMap = new Map<string, RateLimitInfo>();

const SHORT_MAX_REQUESTS = 50;
const SHORT_WINDOW_TIME = 2 * 60 * 60_000;
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

  if (now > userData.shortTermResetTime) {
    userData.shortTermCount = 0;
    userData.shortTermResetTime = now + SHORT_WINDOW_TIME;
  }
  if (userData.shortTermCount >= SHORT_MAX_REQUESTS) {
    console.log('[rateLimiter] Over short-term limit for user:', userId);
    return false;
  }

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

const assistantsEnhancer = createAssistantsEnhancer(
  process.env.OPENAI_ASSISTANT_ID || 'default-assistant-id'
);

async function getInitialAnalysis(
  messages: Message[],
  fileBuffer?: ArrayBuffer,
  fileMime?: string
): Promise<string> {
  console.log('[getInitialAnalysis] Starting with Gemini Flash 2.0');

  const initialAnalysisPrompt = `
You are an energy research query refiner. Process any uploaded file and reframe each query to optimize for energy sector search results.

If a file is provided, extract key text (max 10,000 characters) and summarize:
- Identify energy transactions (e.g., solar M&A, oil trends, geothermal deals).
- Extract dates, companies, amounts, and deal types.

Format your response as:
Original: [user's exact question]
File Summary: [brief summary of file content, if any]
Refined: [reframed query optimized for energy sector search]
Terms: [3-5 key energy industry search terms]

Keep it brief, search-focused, and exclude file content from long-term storage.
If query/file seems unrelated to energy, find relevant energy sector angles.
`;

  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    console.log('[getInitialAnalysis] No user message found');
    return '';
  }

  const contentParts: any[] = [
    {
      type: 'text',
      text: userMessage.content,
    },
  ];

  if (fileBuffer) {
    console.log('[getInitialAnalysis] Processing file, mime:', fileMime);
    contentParts.push({
      type: 'file',
      data: fileBuffer,
      mimeType: fileMime || 'application/pdf',
    });
  }

  try {
    const result = await streamText({
      model: google('gemini-2.0-flash'),
      system: initialAnalysisPrompt,
      messages: [{ role: 'user', content: contentParts }],
    });
    const text = await result.text();
    console.log('[getInitialAnalysis] Gemini Flash 2.0 success, text length:', text.length);
    return text;
  } catch (error) {
    console.error('[getInitialAnalysis] Error:', error);
    throw error;
  }
}

async function enhanceContext(initialAnalysis: string): Promise<string> {
  console.log('[enhanceContext] Starting');
  try {
    const { enhancedContext } = await assistantsEnhancer.enhance(initialAnalysis);
    console.log('[enhanceContext] Enhanced context received');
    return enhancedContext;
  } catch (err) {
    console.error('[enhanceContext] Error:', err);
    return initialAnalysis; // fallback
  }
}

export async function POST(request: Request) {
  console.log('[POST] Enter => /api/chat');
  const session = await auth();
  if (!session?.user?.id) {
    console.log('[POST] Unauthorized => 401');
    return new Response('Unauthorized', { status: 401 });
  }
  console.log('[POST] userId =', session.user.id);

  if (!rateLimiter(session.user.id)) {
    console.log('[POST] Rate limit exceeded');
    return new Response('Too Many Requests', { status: 429 });
  }

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

      console.log('[POST] JSON parse =>', {
        id,
        selectedChatModel,
        messagesCount: messages.length,
      });
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
        console.log('[POST] Parsed messages => count:', messages.length);
      } catch (err) {
        console.error('[POST] Invalid messages JSON =>', err);
        return new Response('Invalid messages JSON', { status: 400 });
      }
    } catch (err) {
      console.error('[POST] Invalid form data =>', err);
      return new Response('Invalid form data', { status: 400 });
    }
  }

  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    console.log('[POST] No user message found => 400');
    return new Response('No user message found', { status: 400 });
  }

  console.log('[POST] Checking chat =>', id);
  const chat = await getChatById({ id });
  if (!chat) {
    console.log('[POST] No chat found => creating new');
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  console.log('[POST] Saving user message => DB');
  await saveMessages({
    messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
  });

  let fileBuffer: ArrayBuffer | undefined;
  let fileMime: string | undefined;
  if (file) {
    console.log('[POST] File found => reading as arrayBuffer');
    fileBuffer = await file.arrayBuffer();
    fileMime = file.type;
  }

  let cachedContext = '';

  return createDataStreamResponse({
    status: 200,
    statusText: 'OK',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
    execute: async (dataStream) => {
      try {
        console.log('[EXECUTE] Step A => getInitialAnalysis');
        const initialAnalysis = await getInitialAnalysis(messages, fileBuffer, fileMime);
        console.log('[EXECUTE] Initial analysis length:', initialAnalysis.length);

        console.log('[EXECUTE] Step B => enhanceContext');
        const enhancedContext = await enhanceContext(initialAnalysis);
        console.log('[EXECUTE] Enhanced context (first 100 chars):', enhancedContext.slice(0, 100));

        console.log('[EXECUTE] Step C => final streaming with model:', selectedChatModel);
        let finalModel;
        if (selectedChatModel.startsWith('openai')) {
          finalModel = openai(selectedChatModel.replace('openai("', '').replace('")', ''));
        } else if (selectedChatModel.startsWith('google')) {
          finalModel = google(selectedChatModel.replace('google("', '').replace('")', ''));
        } else if (selectedChatModel === 'chat-model-reasoning') {
          finalModel = myProvider.languageModel('chat-model-reasoning');
        } else {
          finalModel = myProvider.languageModel(selectedChatModel) || google('gemini-2.0-flash'); // Fallback to Gemini Flash
        }

        let isFirstContent = true;

        try {
          const result = await streamText({
            model: finalModel,
            system: `${systemPrompt({ selectedChatModel })}\n\nEnhanced Context:\n${enhancedContext}`,
            messages,
            maxSteps: 5,
            experimental_activeTools:
              selectedChatModel === 'chat-model-reasoning'
                ? []
                : ['getWeather', 'createDocument', 'updateDocument', 'requestSuggestions'],
            experimental_transform: smoothStream({ chunking: 'sentence' }),
            experimental_generateMessageId: generateUUID,
            tools: {
              getWeather,
              createDocument: createDocument({ session, dataStream }),
              updateDocument: updateDocument({ session, dataStream }),
              requestSuggestions: requestSuggestions({ session, dataStream }),
            },
            onChunk: async (event) => {
              const { chunk } = event;

              if (chunk.type === 'text-delta' && chunk.textDelta.trim() && isFirstContent) {
                isFirstContent = false;
                dataStream.writeData('workflow_stage:complete');
              }

              if (chunk.type === 'reasoning') {
                dataStream.writeMessageAnnotation({
                  type: 'reasoning',
                  content: chunk.textDelta,
                });
              }
            },
            onFinish: async ({ response }) => {
              let content = response.messages[response.messages.length - 1]?.content || '';
              const md = new markdownIt();
              const tokens = md.parse(content, {});
              const companyNames: string[] = [];

              tokens.forEach(token => {
                if (token.type === 'inline' && token.content) {
                  const doc = compromise(token.content);
                  const companies = doc.match('#Organization+').out('array');
                  companyNames.push(...companies.filter(name => name.trim()));
                }
              });

              const uniqueCompanies = [...new Set(companyNames)];
              const logoMap = await inferDomains(uniqueCompanies);

              for (const [company, logoUrl] of Object.entries(logoMap)) {
                if (logoUrl !== 'unknown') {
                  content = content.replace(new RegExp(`\\b${company}\\b`, 'g'), `[${company}](logo:${logoUrl})`);
                }
              }

              const sanitizedMessages = sanitizeResponseMessages({
                messages: response.messages.map(m =>
                  m.id === response.messages[response.messages.length - 1]?.id
                    ? { ...m, content }
                    : m
                ),
              });

              await saveMessages({
                messages: sanitizedMessages.map((message) => ({
                  id: message.id,
                  chatId: id,
                  role: message.role,
                  content: message.content,
                  createdAt: new Date(),
                })),
              });
            },
            experimental_telemetry: {
              isEnabled: true,
              functionId: 'stream-text',
            },
          });

          await result.mergeIntoDataStream(dataStream, {
            sendReasoning: true,
            sendSources: true,
          });
        } catch (streamError) {
          console.error('[EXECUTE:stream] Error during streaming:', streamError);

          try {
            console.log('[EXECUTE] Attempting fallback response');
            const fallbackResult = streamText({
              model: finalModel,
              system: systemPrompt({ selectedChatModel }),
              messages,
              experimental_transform: smoothStream({ chunking: 'sentence' }),
              experimental_generateMessageId: generateUUID,
            });

            await fallbackResult.mergeIntoDataStream(dataStream, {
              sendReasoning: true,
              sendSources: true,
            });
          } catch (fallbackError) {
            console.error('[EXECUTE] Fallback attempt failed:', fallbackError);
            throw fallbackError;
          }
        }
      } catch (err) {
        console.error('[EXECUTE] Error during processing:', err);
        throw err;
      }
    },
    onError: (error) => {
      console.error('[createDataStreamResponse] Final error handler:', error);
      return error instanceof Error ? error.message : 'An error occurred';
    },
  });
}

export async function DELETE(request: Request) {
  console.log('[DELETE] => /api/chat');
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    console.log('[DELETE] No id => 404');
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();
  if (!session?.user) {
    console.log('[DELETE] Unauthorized => 401');
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    console.log('[DELETE] Checking chat =>', id);
    const chat = await getChatById({ id });
    if (!chat || chat.userId !== session.user.id) {
      console.log('[DELETE] Not found/owned => 401');
      return new Response('Unauthorized', { status: 401 });
    }

    console.log('[DELETE] Deleting chat =>', id);
    await deleteChatById({ id });
    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    console.error('[DELETE] Error:', error);
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
