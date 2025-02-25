import { streamText, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { systemPrompt } from '@/lib/ai/prompts';
import { generateUUID, getMostRecentUserMessage } from '@/lib/utils';
import { saveMessages, getChatById, saveChat } from '@/lib/db/queries';
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

// Rate limiting setup
const requestsMap = new Map<string, { shortTermCount: number; shortTermResetTime: number; longTermCount: number; longTermResetTime: number }>();
const SHORT_MAX_REQUESTS = 50;
const SHORT_WINDOW_TIME = 2 * 60 * 60_000;
const LONG_MAX_REQUESTS = 100;
const LONG_WINDOW_TIME = 12 * 60 * 60_000;

function rateLimiter(userId: string): boolean {
  const now = Date.now();
  let userData = requestsMap.get(userId) || {
    shortTermCount: 0,
    shortTermResetTime: now + SHORT_WINDOW_TIME,
    longTermCount: 0,
    longTermResetTime: now + LONG_WINDOW_TIME,
  };

  if (now > userData.shortTermResetTime) {
    userData.shortTermCount = 0;
    userData.shortTermResetTime = now + SHORT_WINDOW_TIME;
  }
  if (userData.shortTermCount >= SHORT_MAX_REQUESTS) return false;

  if (now > userData.longTermResetTime) {
    userData.longTermCount = 0;
    userData.longTermResetTime = now + LONG_WINDOW_TIME;
  }
  if (userData.longTermCount >= LONG_MAX_REQUESTS) return false;

  userData.shortTermCount++;
  userData.longTermCount++;
  requestsMap.set(userId, userData);
  return true;
}

// Assistants enhancer from assistants.ts
const assistantsEnhancer = createAssistantsEnhancer(process.env.OPENAI_ASSISTANT_ID || 'default-assistant-id');

// Convert content to string
function convertContentToString(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(item => typeof item === 'string' ? item : item?.text || '').join('');
  return '';
}

// Initial analysis with Gemini Flash 2.0
async function getInitialAnalysis(messages: Message[], fileBuffer?: ArrayBuffer, fileMime?: string): Promise<string> {
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) return '';

  const initialPrompt = `
    You are an energy research query refiner. Process any uploaded file and reframe each query for energy sector search results.
    File Summary (if provided): Extract key text (max 10,000 chars) and summarize energy transactions (e.g., solar M&A, oil trends).
    Format: Original: [query] | Refined: [reframed query] | Terms: [3-5 energy terms]
  `;

  const contentParts = [{ type: 'text', text: userMessage.content }];
  if (fileBuffer) contentParts.push({ type: 'file', data: fileBuffer, mimeType: fileMime || 'application/pdf' });

  try {
    const { text } = await generateText({
      model: google('gemini-2.0-flash', { useSearchGrounding: true }),
      system: initialPrompt,
      messages: [{ role: 'user', content: contentParts }],
    });
    return text;
  } catch (error) {
    console.error('Gemini Flash 2.0 Error:', error);
    return userMessage.content; // Fallback
  }
}

// Enhance context using assistants.ts
async function enhanceContext(initialAnalysis: string): Promise<string> {
  try {
    const { enhancedContext } = await assistantsEnhancer.enhance(initialAnalysis);
    return enhancedContext || initialAnalysis; // Fallback to initial if empty
  } catch (error) {
    console.error('Assistants Enhancer Error:', error);
    return initialAnalysis; // Fallback
  }
}

// Process spreadsheet updates
async function processSpreadsheetUpdate(messages: Message[], currentData?: any): Promise<any> {
  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) return currentData || [['Date', 'Deal Type', 'Amount']];

  const spreadsheetPrompt = `
    Generate or update a spreadsheet with columns: Date, Deal Type, Amount.
    Parse user message for date (YYYY-MM-DD), deal type (e.g., "Solar M&A"), and amount (e.g., $1M).
    Existing data: ${JSON.stringify(currentData || [['Date', 'Deal Type', 'Amount']])}.
    Return a 2D array.
  `;

  try {
    const { text } = await generateText({
      model: google('gemini-2.0-flash'),
      system: spreadsheetPrompt,
      messages: [{ role: 'user', content: userMessage.content }],
    });
    return JSON.parse(text);
  } catch (error) {
    console.error('Spreadsheet Update Error:', error);
    return currentData || [['Date', 'Deal Type', 'Amount']];
  }
}

// Select final model
function getFinalModel(selectedModel: string) {
  if (selectedModel.startsWith('openai')) {
    return openai(selectedModel.replace('openai("', '').replace('")', ''));
  } else if (selectedModel.startsWith('google')) {
    return google(selectedModel.replace('google("', '').replace('")', ''));
  }
  return google('gemini-2.0-flash'); // Default
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

  if (!rateLimiter(session.user.id)) return new Response('Too Many Requests', { status: 429 });

  const formData = await request.formData();
  const body = {
    messages: JSON.parse(formData.get('messages')?.toString() || '[]'),
    selectedChatModel: formData.get('selectedChatModel')?.toString() || 'google("gemini-2.0-flash")',
    id: formData.get('id')?.toString() || generateUUID(),
    file: formData.get('file') as File | null,
    currentData: formData.get('currentData') ? JSON.parse(formData.get('currentData') as string) : undefined,
  };

  const { messages, selectedChatModel, id, file, currentData } = body;
  if (!messages.length) {
    return new Response(JSON.stringify({
      messages: [{ id: generateUUID(), role: 'assistant', content: 'Welcome! How can I assist you today?' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) return new Response('No user message found', { status: 400 });

  const isSpreadsheetUpdate = userMessage.content.toLowerCase().includes('add') && 
    (userMessage.content.toLowerCase().includes('deal') || userMessage.content.toLowerCase().includes('spreadsheet'));
  if (isSpreadsheetUpdate) {
    const updatedSpreadsheet = await processSpreadsheetUpdate(messages, currentData);
    return new Response(JSON.stringify({ updatedData: updatedSpreadsheet }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const chat = await getChatById({ id });
  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title: title || 'New Chat' });
  }
  await saveMessages({
    messages: [{ ...userMessage, createdAt: new Date(), chatId: id, metadata: null }],
  });

  const fileBuffer = file ? await file.arrayBuffer() : undefined;
  const fileMime = file?.type;

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
      createDocument: createDocument({ session }),
      updateDocument: updateDocument({ session }),
      requestSuggestions: requestSuggestions({ session }),
    },
    onFinish: async ({ response }) => {
      const assistantMessage = response.messages.find(m => m.role === 'assistant');
      if (assistantMessage) {
        const content = convertContentToString(assistantMessage.content);
        const compiledMdx = await compile(content, {
          outputFormat: 'function-body',
          remarkPlugins: [remarkGfm],
          rehypePlugins: [rehypeHighlight, rehypeRaw],
        });
        await saveMessages({
          messages: [{
            id: generateUUID(),
            chatId: id,
            role: 'assistant',
            content: compiledMdx.toString(),
            createdAt: new Date(),
            metadata: null,
          }],
        });
      }
    },
  });

  return result.toDataStreamResponse();
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return new Response('Not Found', { status: 404 });

  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const chat = await getChatById({ id });
  if (!chat || chat.userId !== session.user.id) return new Response('Unauthorized', { status: 401 });

  await deleteChatById({ id });
  return new Response('Chat deleted', { status: 200 });
}
