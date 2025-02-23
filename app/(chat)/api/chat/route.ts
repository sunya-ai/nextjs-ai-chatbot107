import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { type Message, createDataStreamResponse, smoothStream, streamText } from 'ai';
import { NextResponse } from 'next/server';
import auth from 'next-auth'; // Changed to default import
import { systemPrompt } from '@/lib/ai/prompts';
import { deleteChatById, getChatById, saveChat, saveMessages } from '@/lib/db/queries';
import { generateUUID, getMostRecentUserMessage, sanitizeResponseMessages } from '@/lib/utils';
import { generateTitleFromUserMessage } from '@/app/(chat)/actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { inferDomains } from '@/lib/ai/tools/infer-domains';
import { createAssistantsEnhancer } from '@/lib/ai/enhancers/assistants';
import markdownIt from 'markdown-it';
import compromise from 'compromise';

export const maxDuration = 240;

function rateLimiter(userId: string): boolean {
  const now = Date.now();
  let userData = requestsMap.get(userId);

  if (!userData) {
    userData = {
      shortTermCount: 0,
      shortTermResetTime: now + 2 * 60 * 60_000, // 2 hours
      longTermCount: 0,
      longTermResetTime: now + 12 * 60 * 60_000, // 12 hours
    };
  }

  if (now > userData.shortTermResetTime) {
    userData.shortTermCount = 0;
    userData.shortTermResetTime = now + 2 * 60 * 60_000;
  }
  if (userData.shortTermCount >= 50) return false;

  if (now > userData.longTermResetTime) {
    userData.longTermCount = 0;
    userData.longTermResetTime = now + 12 * 60 * 60_000;
  }
  if (userData.longTermCount >= 100) return false;

  userData.shortTermCount++;
  userData.longTermCount++;
  requestsMap.set(userId, userData);
  return true;
}

const requestsMap = new Map<string, {
  shortTermCount: number;
  shortTermResetTime: number;
  longTermCount: number;
  longTermResetTime: number;
}>();

function isFollowUp(messages: Message[]): boolean {
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) return false;
  const prevMessage = messages[messages.length - 2];
  if (!prevMessage || prevMessage.role !== 'assistant') return false;
  const content = userMessage.content.toLowerCase();
  return content.includes('this') || content.includes('that') || content.includes('more') || content.match(/^\w+$/);
}

const assistantsEnhancer = createAssistantsEnhancer(process.env.OPENAI_ASSISTANT_ID || 'default-assistant-id');

async function getInitialAnalysis(messages: Message[], fileBuffer?: ArrayBuffer, fileMime?: string): Promise<string> {
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

  const contentParts: any[] = [{ type: 'text', text: userMessage.content }];

  if (fileBuffer) {
    console.log('[getInitialAnalysis] Processing file, mime:', fileMime);
    contentParts.push({
      type: 'file',
      data: fileBuffer,
      mimeType: fileMime || 'application/pdf',
    });
  }

  try {
    const { text } = await streamText({
      model: google('gemini-2.0-flash-02'),
      system: initialAnalysisPrompt,
      messages: [{ role: 'user', content: contentParts }],
    }).then(async result => ({ text: await result.text() }));

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
    return initialAnalysis; // Fallback
  }
}

export async function POST(request: Request) {
  console.log('[POST] /api/chat started');

  // Use NextAuth's auth() to get session
  const session = await auth();
  if (!session?.user?.id) {
    console.log('[POST] Unauthorized');
    return new Response('Unauthorized', { status: 401 });
  }

  if (!rateLimiter(session.user.id)) {
    console.log('[POST] Rate limit exceeded');
    return new Response('Too Many Requests', { status: 429 });
  }

  let id = '';
  let messages: Message[] = [];
  let selectedChatModel: string | undefined;
  let file: File | null = null;

  if (request.headers.get('content-type')?.includes('application/json')) {
    const json = await request.json();
    id = json.id || '';
    messages = json.messages || [];
    selectedChatModel = json.selectedChatModel;
  } else {
    const formData = await request.formData();
    id = formData.get('id')?.toString() || '';
    const messagesStr = formData.get('messages')?.toString() || '[]';
    selectedChatModel = formData.get('selectedChatModel')?.toString();
    file = formData.get('file') as File | null;
    messages = JSON.parse(messagesStr);
  }

  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    console.log('[POST] No user message');
    return new Response('No user message found', { status: 400 });
  }

  if (!selectedChatModel) {
    console.log('[POST] No chat model selected');
    return new Response('Chat model not specified', { status: 400 });
  }

  const chat = await getChatById({ id });
  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  await saveMessages({ messages: [{ ...userMessage, createdAt: new Date(), chatId: id }] });

  let fileBuffer: ArrayBuffer | undefined;
  let fileMime: string | undefined;
  if (file) {
    fileBuffer = await file.arrayBuffer();
    fileMime = file.type;
  }

  let cachedContext = '';

  return createDataStreamResponse({
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    execute: async (dataStream) => {
      const isFollowUpQuery = isFollowUp(messages);
      let initialAnalysis = '';
      let enhancedContext = '';

      if (isFollowUpQuery && cachedContext) {
        initialAnalysis = `Follow-up: ${userMessage.content}\nPrior Context: ${cachedContext.slice(0, 1000)}`;
        enhancedContext = cachedContext;
      } else {
        initialAnalysis = await getInitialAnalysis(messages, fileBuffer, fileMime);
        enhancedContext = await enhanceContext(initialAnalysis);
        cachedContext = enhancedContext;
      }

      const finalModel = selectedChatModel.startsWith('openai')
        ? openai(selectedChatModel.replace('openai("', '').replace('")', ''))
        : selectedChatModel.startsWith('google')
        ? google(selectedChatModel.replace('google("', '').replace('")', ''))
        : null;

      if (!finalModel) {
        throw new Error(`Unsupported chat model: ${selectedChatModel}`);
      }

      let isFirstContent = true;
      let reasoningStarted = false;

      const result = await streamText({
        model: finalModel,
        system: `${systemPrompt({ selectedChatModel })}\n\nEnhanced Context:\n${enhancedContext}`,
        messages,
        maxSteps: 5,
        experimental_activeTools: [
          'getWeather',
          'createDocument',
          'updateDocument',
          'requestSuggestions',
        ],
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

          if (chunk.type === 'reasoning' && !reasoningStarted) {
            reasoningStarted = true;
            dataStream.writeMessageAnnotation({
              type: 'thinking',
              content: 'Let’s break this down…', // Grok 3 style
            });
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
          const companyNames = [];

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
            messages: sanitizedMessages.map(m => ({
              id: m.id,
              chatId: id,
              role: m.role,
              content: m.content,
              createdAt: new Date(),
            }))
          });
        },
      });

      await result.mergeIntoDataStream(dataStream, {
        sendReasoning: true,
        sendSources: true,
      });
    },
    onError: (error) => {
      console.error('[createDataStreamResponse] Error:', error);
      return error instanceof Error ? error.message : 'An error occurred';
    },
  });
}

export async function DELETE(request: Request) {
  console.log('[DELETE] /api/chat started');

  // Use NextAuth's auth() for session
  const session = await auth();
  if (!session?.user) {
    console.log('[DELETE] Unauthorized');
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const chat = await getChatById({ id });
  if (!chat || chat.userId !== session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  await deleteChatById({ id });
  return new Response('Chat deleted', { status: 200 });
}
