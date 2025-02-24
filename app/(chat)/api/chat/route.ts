import {
  type Message,
  type CoreAssistantMessage,
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
import { generateTitleFromUserMessage } from '@/app/(chat)/actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { createAssistantsEnhancer } from '@/lib/ai/enhancers/assistants';
import { inferDomains } from '@/lib/ai/tools/infer-domains';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import markdownIt from 'markdown-it';
import compromise from 'compromise';
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

function isFollowUp(messages: Message[]): boolean {
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) return false;
  const prevMessage = messages[messages.length - 2];
  if (!prevMessage || prevMessage.role !== 'assistant') return false;
  const content = userMessage.content.toLowerCase();
  return (
    content.includes('this') ||
    content.includes('that') ||
    content.includes('more') ||
    !!content.match(/^\w+$/)
  );
}

const assistantsEnhancer = createAssistantsEnhancer(
  process.env.OPENAI_ASSISTANT_ID || 'default-assistant-id'
);

/**
 * Helper to convert message content to a string for MDX compilation.
 */
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

/**
 * For the initial analysis we use generateText to get a complete text result, compiled as MDX.
 */
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

    const compiledMdx = await compile(text, {
      outputFormat: 'function-body',
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypeHighlight, rehypeRaw],
    });
    return compiledMdx.toString();
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

    const compiledMdx = await compile(enhancedContext, {
      outputFormat: 'function-body',
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypeHighlight, rehypeRaw],
    });
    return compiledMdx.toString();
  } catch (err) {
    console.error('[enhanceContext] Error:', err);
    return initialAnalysis;
  }
}

/**
 * Helper function to generate or update spreadsheet data based on user input.
 */
async function processSpreadsheetUpdate(
  messages: Message[],
  currentData?: any
): Promise<any> {
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) return currentData;

  const content = userMessage.content.toLowerCase();
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
    return JSON.parse(text); // Expecting a 2D array like [["Date", "Deal Type", "Amount"], ["2025-03-01", "Solar M&A", 1000000]]
  } catch (error) {
    console.error('[processSpreadsheetUpdate] Error:', error);
    return currentData || [['Date', 'Deal Type', 'Amount']]; // Fallback to existing or default
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
  let currentData: any; // For spreadsheet data from formData

  if (request.headers.get('content-type')?.includes('application/json')) {
    console.log('[POST] => Found JSON body');
    try {
      const json = await request.json();
      id = json.id;
      messages = json.messages;
      selectedChatModel = json.selectedChatModel || 'default-model';
      currentData = json.currentData; // Extract current spreadsheet data if provided

      console.log('[POST] JSON parse =>', {
        id,
        selectedChatModel,
        messagesCount: messages.length,
        hasCurrentData: !!currentData,
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
      currentData = formData.get('currentData') ? JSON.parse(formData.get('currentData') as string) : undefined;

      console.log('[POST] formData =>', {
        id,
        selectedChatModel,
        hasFile: !!file,
        hasCurrentData: !!currentData,
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

  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    console.log('[POST] No user message found => 400');
    return new Response('No user message found', { status: 400 });
  }

  console.log('[POST] checking chat =>', id);
  const chat = await getChatById({ id });
  if (!chat) {
    console.log('[POST] no chat => creating new');
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title: title || 'New Chat' });
  }

  console.log('[POST] saving user message => DB');
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

  // Check if the message is a spreadsheet update request
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

  console.log('[POST] => createDataStreamResponse => multi-pass');
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
        console.log('[EXECUTE] initialAnalysis length =>', initialAnalysis.length);

        console.log('[EXECUTE] Step B => enhanceContext');
        const enhancedContext = await enhanceContext(initialAnalysis);
        console.log('[EXECUTE] enhancedContext => first 100 chars:', enhancedContext.slice(0, 100));

        console.log('[EXECUTE] Step C => final streaming with model:', selectedChatModel);
        let finalModel;
        if (selectedChatModel.startsWith('openai')) {
          finalModel = openai(selectedChatModel.replace('openai("', '').replace('")', ''));
        } else if (selectedChatModel.startsWith('google')) {
          finalModel = google(selectedChatModel.replace('google("', '').replace('")', ''));
        } else if (selectedChatModel === 'chat-model-reasoning') {
          finalModel = myProvider.languageModel('chat-model-reasoning');
        } else {
          finalModel = myProvider.languageModel(selectedChatModel) || google('gemini-2.0-flash');
        }

        let isFirstContent = true;
        let reasoningStarted = false;

        const result = await streamText({
          model: finalModel,
          system: `${systemPrompt({ selectedChatModel })}\n\nEnhanced Context:\n${enhancedContext}`,
          messages,
          maxSteps: 5,
          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : ['getWeather', 'createDocument', 'updateDocument', 'requestSuggestions'],
          experimental_transform: smoothStream({ chunking: 'line' }),
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

            if (chunk.type === 'reasoning' && !reasoningStarted) {
              reasoningStarted = true;
              dataStream.writeMessageAnnotation({
                type: 'thinking',
                content: 'Let’s break this down…',
              });
            }

            if (chunk.type === 'reasoning') {
              dataStream.writeMessageAnnotation({
                type: 'reasoning',
                content: chunk.textDelta,
              });
            }

            switch (chunk.type) {
              case 'tool-call':
              case 'tool-call-streaming-start':
              case 'tool-call-delta':
              case 'tool-result':
                break;
            }
          },
          onFinish: async ({ response, reasoning }) => {
            if (session.user?.id) {
              try {
                let content = response.messages[response.messages.length - 1]?.content || '';
                let contentString: string;
                if (typeof content === 'string') {
                  contentString = content;
                } else if (Array.isArray(content)) {
                  contentString = content.map(part => ('text' in part ? part.text : '')).join('');
                } else {
                  contentString = '';
                }

                const md = new markdownIt();
                const tokens = md.parse(contentString, {});
                const companyNames: string[] = [];
                const sources: { id: string; url: string }[] = [];

                tokens.forEach(token => {
                  if (token.type === 'inline' && token.content) {
                    const doc = compromise(token.content);
                    const companies = doc.match('#Organization+').out('array') as string[];
                    companyNames.push(...companies.filter(name => name.trim()));

                    const citationRegex = /\[\d+(,\s*\d+)*\]/g;
                    let match;
                    while ((match = citationRegex.exec(token.content)) !== null) {
                      const citationIds = match[0]
                        .replace(/[\[\]]/g, '')
                        .split(',')
                        .map((id) => id.trim())
                        .map(Number);
                      citationIds.forEach((id) => {
                        sources.push({ id: `source-${id}`, url: `https://example.com/source-${id}` });
                      });
                    }
                  }
                });

                const uniqueCompanies = [...new Set(companyNames)];
                const logoMap = await inferDomains(uniqueCompanies);

                for (const [company, logoUrl] of Object.entries(logoMap)) {
                  if (logoUrl !== 'unknown') {
                    contentString = contentString.replace(new RegExp(`\\b${company}\\b`, 'g'), `[${company}](logo:${logoUrl})`);
                  }
                }

                const compiledMdx = await compile(contentString, {
                  outputFormat: 'function-body',
                  remarkPlugins: [remarkGfm],
                  rehypePlugins: [rehypeHighlight, rehypeRaw],
                });

                const sanitizedMessages = sanitizeResponseMessages({
                  messages: response.messages
                    .filter(m => m.role === 'assistant')
                    .map((m, index) => ({
                      ...m,
                      id: m.id || generateUUID(),
                      role: 'assistant',
                      content: compiledMdx.toString(),
                    }) as CoreAssistantMessage & { id: string }),
                  reasoning: reasoning || 'Generated reasoning for assistant response',
                });

                await saveMessages({
                  messages: sanitizedMessages.map((message) => ({
                    id: message.id,
                    chatId: id,
                    role: message.role,
                    content: message.content,
                    createdAt: new Date(),
                    metadata: JSON.stringify({
                      sources: [...new Set(sources)],
                      reasoning: reasoning || 'No reasoning provided',
                    }),
                  })),
                });
              } catch (error) {
                console.error('Failed to save chat', error);
              }
            }
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
