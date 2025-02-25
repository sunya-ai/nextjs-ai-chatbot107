import {
  type Message,
  createDataStreamResponse,
  streamText,
  generateText,
} from 'ai';
import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID, getMostRecentUserMessage } from '@/lib/utils';
import { generateTitleFromUserMessage } from '@/app/(chat)/actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { createAssistantsEnhancer } from '@/lib/ai/enhancers/assistants';
import { compile } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';

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

function convertContentToString(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.text === 'string') return item.text;
        return '';
      })
      .join('');
  }
  return '';
}

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
    const { text } = await generateText({
      model: google('gemini-2.0-flash', {
        useSearchGrounding: true,
        structuredOutputs: false,
      }),
      system: initialAnalysisPrompt,
      messages: [{ role: 'user', content: contentParts }],
    });
    console.log('[getInitialAnalysis] Gemini Flash 2.0 success, text length:', text.length);
    return text;
  } catch (error) {
    console.error('[getInitialAnalysis] Error:', error);
    return userMessage.content;
  }
}

async function enhanceContext(initialAnalysis: string): Promise<string> {
  try {
    const { enhancedContext } = await assistantsEnhancer.enhance(initialAnalysis);
    return enhancedContext || initialAnalysis;
  } catch (error) {
    console.error('Assistants Enhancer Error:', error);
    return initialAnalysis;
  }
}

async function processSpreadsheetUpdate(
  messages: Message[],
  currentData?: any
): Promise<any> {
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) return currentData || [['Date', 'Deal Type', 'Amount']];

  const spreadsheetPrompt = `
You are an energy deal spreadsheet manager. Based on the user's message and any existing data, generate or update a spreadsheet with columns: Date, Deal Type, Amount.

- If the message requests adding a deal (e.g., "Add a solar deal for $1M on 2025-03-01"), append a new row.
- If no existing data is provided, start with headers: ["Date", "Deal Type", "Amount"].
- Parse the message for date (YYYY-MM-DD), deal type (e.g., "Solar M&A", "Oil Trends", "Geothermal Deals"), and amount (in dollars, e.g., $1M or 1000000).
- Return the updated 2D array directly (no additional text).

Existing data: ${JSON.stringify(currentData || [['Date', 'Deal Type', 'Amount']])}.
`;

  try {
    const { text } = await generateText({
      model: google('gemini-2.0-flash'),
      system: spreadsheetPrompt,
      messages: [{ role: 'user', content: userMessage.content }],
    });
    return JSON.parse(text);
  } catch (error) {
    console.error('[processSpreadsheetUpdate] Error:', error);
    return currentData || [['Date', 'Deal Type', 'Amount']];
  }
}

function getFinalModel(selectedModel: string) {
  if (selectedModel.startsWith('openai')) {
    return openai(selectedModel.replace('openai("', '').replace('")', ''));
  } else if (selectedModel.startsWith('google')) {
    return google(selectedModel.replace('google("', '').replace('")', ''));
  }
  return google('gemini-2.0-flash');
}

export async function POST(request: Request) {
  console.log('[POST] Initial load or chat request received');
  try {
    const session = await auth();
    if (!session?.user?.id) {
      console.log('[POST] Unauthorized => 401');
      return new Response('Unauthorized', { status: 401 });
    }

    if (!rateLimiter(session.user.id)) {
      console.log('[POST] Rate limit exceeded');
      return new Response('Too Many Requests', { status: 429 });
    }

    const formData = await request.formData();
    const body = {
      messages: JSON.parse(formData.get('messages')?.toString() || '[]'),
      selectedChatModel: formData.get('selectedChatModel')?.toString() || 'google("gemini-2.0-flash")',
      id: formData.get('id')?.toString() || generateUUID(),
      file: formData.get('file') as File | null,
      currentData: formData.get('currentData') ? JSON.parse(formData.get('currentData') as string) : undefined,
    };

    console.log('[POST] Request body:', body);

    const messages: Message[] = Array.isArray(body.messages) ? body.messages : [];
    const id = body.id || generateUUID();
    const selectedChatModel = body.selectedChatModel || 'google("gemini-2.0-flash")';
    const file = body.file instanceof File ? body.file : null;
    let currentData = body.currentData;

    if (messages.length === 0) {
      console.log('[POST] Empty messages, returning welcome message');
      return new Response(JSON.stringify({
        messages: [{
          id: generateUUID(),
          role: 'assistant',
          content: 'Welcome! How can I assist you today?',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const userMessage = getMostRecentUserMessage(messages);
    if (!userMessage) {
      console.log('[POST] No user message found => 400');
      return new Response('No user message found', { status: 400 });
    }

    const content = userMessage.content.toLowerCase();
    const isSpreadsheetUpdate = content.includes('add') && (content.includes('deal') || content.includes('spreadsheet'));

    if (isSpreadsheetUpdate) {
      console.log('[POST] Detected spreadsheet update request');
      const updatedSpreadsheet = await processSpreadsheetUpdate(messages, currentData);
      return new Response(JSON.stringify({ updatedData: updatedSpreadsheet }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const chat = await getChatById({ id });
    if (!chat) {
      console.log('[POST] no chat => creating new');
      const title = await generateTitleFromUserMessage({ message: userMessage });
      await saveChat({ id, userId: session.user.id, title: title || 'New Chat' });
    }

    await saveMessages({
      messages: [{ ...userMessage, createdAt: new Date(), chatId: id, metadata: null }],
    });

    let fileBuffer: ArrayBuffer | undefined;
    let fileMime: string | undefined;
    if (file) {
      console.log('[POST] file found => read as arrayBuffer');
      fileBuffer = await file.arrayBuffer();
      fileMime = file.type;
    }

    console.log('[POST] => createDataStreamResponse => multi-pass');
    return createDataStreamResponse({
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      execute: async (dataStream) => {
        try {
          const initialAnalysis = await getInitialAnalysis(messages, fileBuffer, fileMime);
          const enhancedContext = await enhanceContext(initialAnalysis);
          const finalPrompt = `Context:\n${enhancedContext}\n\nQuery: ${initialAnalysis}`;

          const finalModel = getFinalModel(selectedChatModel);
          const result = await streamText({
            model: finalModel,
            system: systemPrompt({ selectedChatModel }),
            messages: [{ role: 'user', content: finalPrompt }],
            tools: {
              getWeather,
              createDocument: createDocument({ session, dataStream }),
              updateDocument: updateDocument({ session, dataStream }),
              requestSuggestions: requestSuggestions({ session, dataStream }),
            },
            onFinish: async ({ response }) => {
              const assistantMessage = response.messages.find(m => m.role === 'assistant');
              if (assistantMessage) {
                let content = convertContentToString(assistantMessage.content);
                let metadata = null;

                try {
                  const parsedContent = JSON.parse(content);
                  if (Array.isArray(parsedContent)) {
                    content = JSON.stringify(parsedContent);
                    metadata = {
                      isArtifact: true,
                      kind: Array.isArray(parsedContent[0]) ? 'table' : 'chart',
                    };
                  } else {
                    const compiledMdx = await compile(content, {
                      outputFormat: 'function-body',
                      remarkPlugins: [remarkGfm],
                      rehypePlugins: [rehypeHighlight, rehypeRaw],
                    });
                    content = compiledMdx.toString();
                  }
                } catch (e) {
                  const compiledMdx = await compile(content, {
                    outputFormat: 'function-body',
                    remarkPlugins: [remarkGfm],
                    rehypePlugins: [rehypeHighlight, rehypeRaw],
                  });
                  content = compiledMdx.toString();
                }

                await saveMessages({
                  messages: [{
                    id: generateUUID(),
                    chatId: id,
                    role: 'assistant',
                    content,
                    createdAt: new Date(),
                    metadata: metadata ? JSON.stringify(metadata) : null,
                  }],
                });
              }
            },
          });

          await result.mergeIntoDataStream(dataStream, {
            sendReasoning: true,
            sendSources: true,
          });
        } catch (err) {
          console.error('[EXECUTE] Error during processing:', err);
          throw err;
        }
      },
      onError: (error) => {
        console.error('[createDataStreamResponse] Final error handler:', error);
        return 'Internal Server Error';
      },
    });
  } catch (error: unknown) {
    console.error('[POST] Error in POST handler:', error);
    const message = error instanceof Error && error.message.includes('file')
      ? 'File processing failed'
      : 'Internal Server Error';
    return new Response(message, { status: 500 });
  }
}

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
