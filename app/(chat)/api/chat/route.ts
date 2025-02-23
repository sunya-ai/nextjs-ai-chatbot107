import { google } from '@ai-sdk/google';
import { type Message, createDataStreamResponse, smoothStream, streamText } from 'ai';
import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { openai } from '@ai-sdk/openai';
import { systemPrompt } from '@/lib/ai/prompts';
import { deleteChatById, getChatById, saveChat, saveMessages, getMessagesByChatId } from '@/lib/db/queries';
import { generateUUID, getMostRecentUserMessage, sanitizeResponseMessages } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument, updateDocument, requestSuggestions, getWeather, fetch_energy_deals } from '@/lib/ai/tools';
import { createAssistantsEnhancer } from '@/lib/ai/enhancers/assistants';
import { inferDomains } from '@/lib/ai/tools'; // Use batch inference
import markdownIt from 'markdown-it'; // For markdown parsing
import compromise from 'compromise'; // For better company detection

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
  console.log('[getInitialAnalysis] Start with Gemini Flash 2.0 (internal)');

  const initialAnalysisPrompt = `
You are an energy research query refiner. Process any uploaded PDF or document and reframe each query to optimize for energy sector search results.

If a file is provided, extract key text (max 10,000 characters) and summarize:
- Identify energy transactions (e.g., solar M&A, oil trends, geothermal deals).
- Extract dates, companies, amounts, and deal types.

Format your response as:
Original: [user's exact question]
File Summary: [brief summary of file content, if any]
Refined: [reframed query optimized for energy sector search]
Terms: [3-5 key energy industry search terms]

Keep it brief, search-focused, and exclude file content from long-term storage (use only for analysis, not streamed to user).
If query/file seems unrelated to energy, find relevant energy sector angles.
`;

  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    console.log('[getInitialAnalysis] No user message => returning empty string');
    return '';
  }

  const contentParts: any[] = [
    {
      type: 'text',
      text: userMessage.content,
    },
  ];

  if (fileBuffer) {
    console.log('[getInitialAnalysis] Attaching file part, mime:', fileMime);
    contentParts.push({
      type: 'file',
      data: fileBuffer,
      mimeType: fileMime || 'application/pdf',
    });
  }

  try {
    console.log('[getInitialAnalysis] Using generateText => gemini-2.0-flash-02 (internal)');
    const { text } = await generateText({
      model: google('gemini-2.0-flash-02', {
        useSearchGrounding: true,
        structuredOutputs: false,
      }),
      system: initialAnalysisPrompt,
      messages: [
        {
          role: 'user',
          content: contentParts,
        },
      ],
    });

    console.log('[getInitialAnalysis] Gemini Flash 2.0 success (internal), text length:', text?.length || 0);
    return text;
  } catch (error) {
    console.error('[getInitialAnalysis] Gemini Flash 2.0 error =>', error);
    throw error;
  }
}

async function enhanceContext(initialAnalysis: string): Promise<string> {
  console.log('[enhanceContext] Start');
  try {
    const { enhancedContext } = await assistantsEnhancer.enhance(initialAnalysis);
    console.log('[enhanceContext] OpenAI/Perplexity success => got enhancedContext');
    return enhancedContext;
  } catch (err) {
    console.error('[enhanceContext] error =>', err);
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
    console.log('[POST] rate-limit => 429');
    return new Response('Too Many Requests', { status: 429 });
  }

  console.log('[POST] Checking content-type =>', request.headers.get('content-type'));

  let id = '';
  let messages: Message[] = [];
  let selectedChatModel = 'openai(\'gpt-4o\')'; // Default to Vercel AI Chatbot model for compatibility
  let file: File | null = null;

  if (request.headers.get('content-type')?.includes('application/json')) {
    console.log('[POST] => Found JSON body');
    try {
      const json = await request.json();
      id = json.id || '';
      messages = json.messages || [];
      selectedChatModel = json.selectedChatModel || 'openai(\'gpt-4o\')'; // Default updated

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
      const messagesStr = formData.get('messages')?.toString() || '[]';
      selectedChatModel = formData.get('selectedChatModel')?.toString() || 'openai(\'gpt-4o\')'; // Default updated
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

  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    console.log('[POST] no user message => 400');
    return new Response('No user message found', { status: 400 });
  }

  console.log('[POST] checking chat =>', id);
  const chat = await getChatById({ id });
  if (!chat) {
    console.log('[POST] no chat => creating new');
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  console.log('[POST] saving user message => DB');
  await saveMessages({ messages: [{ ...userMessage, createdAt: new Date(), chatId: id }] });

  let fileBuffer: ArrayBuffer | undefined;
  let fileMime: string | undefined;
  if (file) {
    console.log('[POST] file found => read as arrayBuffer');
    fileBuffer = await file.arrayBuffer();
    fileMime = file.type;
  }

  let cachedContext = '';

  console.log('[POST] => createDataStreamResponse => multi-pass');
  return createDataStreamResponse({
    status: 200,
    statusText: 'OK',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
    execute: async (dataStream) => {
      try {
        const isFollowUpQuery = isFollowUp(messages);
        console.log('[EXECUTE] Is follow-up:', isFollowUpQuery);

        let initialAnalysis = '';
        let enhancedContext = '';

        if (isFollowUpQuery && cachedContext) {
          console.log('[EXECUTE] Using cached context for follow-up');
          initialAnalysis = `Follow-up: ${userMessage.content}\nPrior Context: ${cachedContext.slice(0, 1000)}`;
          enhancedContext = cachedContext; // Skip Gemini and assistants.ts
        } else {
          console.log('[EXECUTE] Full analysis for new query');
          initialAnalysis = await getInitialAnalysis(messages, fileBuffer, fileMime);
          enhancedContext = await enhanceContext(initialAnalysis);
          cachedContext = enhancedContext; // Cache for follow-ups
        }

        console.log('[EXECUTE] Step C => final streaming with model:', selectedChatModel);
        const finalModel = myProvider.languageModel(selectedChatModel);

        let isFirstContent = true;
        let reasoningStarted = false;

        try {
          const result = streamText({
            model: finalModel,
            system: `${systemPrompt({ selectedChatModel })}\n\nEnhanced Context:\n${enhancedContext}`,
            messages,
            maxSteps: 5,
            experimental_activeTools:
              selectedChatModel === 'chat-model-reasoning'
                ? []
                : ['getWeather', 'createDocument', 'updateDocument', 'requestSuggestions', 'fetch_energy_deals'],
            experimental_transform: smoothStream({
              chunking: 'sentence', // Faster, v0-like
            }),
            experimental_generateMessageId: generateUUID,
            tools: {
              getWeather,
              createDocument: createDocument({ session, dataStream }),
              updateDocument: updateDocument({ session, dataStream }),
              requestSuggestions: requestSuggestions({ session, dataStream }),
              fetch_energy_deals: {
                description: 'Retrieve latest energy transaction deals (e.g., solar, oil, geothermal) from RAG database',
                parameters: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'Energy sector or deal type (e.g., solar M&A, geothermal fundraising)' },
                    limit: { type: 'number', default: 5 },
                  },
                },
                execute: async ({ query, limit = 5 }) => {
                  const queryEmbedding = await openai.embeddings.create({ input: query });
                  const transactions = await openai.beta.vectorStores.files.search(process.env.OPENAI_VECTOR_STORE_ID, {
                    query: queryEmbedding.data[0].embedding,
                    limit,
                  });
                  return { deals: transactions.data.map(t => t.metadata) };
                },
              },
            },
            onChunk: async (event) => {
              const { chunk } = event;

              if (chunk.type === 'text-delta' && chunk.textDelta.trim() && isFirstContent) {
                isFirstContent = false;
                dataStream.writeData('workflow_stage:complete'); // Kept for potential debugging or UI
              }

              if (selectedChatModel === 'chat-model-reasoning' && chunk.type === 'reasoning') {
                if (!reasoningStarted) {
                  dataStream.writeMessageAnnotation({
                    type: 'thinking',
                    content: 'Let’s break this down…', // Grok 3-like
                  });
                  reasoningStarted = true;
                }
                dataStream.writeMessageAnnotation({
                  type: 'reasoning',
                  content: chunk.textDelta,
                });
              } else if (isLoading && !isFirstContent) {
                dataStream.writeMessageAnnotation({
                  type: 'progress',
                  content: 'Analyzing energy data…', // v0-like
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
                  const md = new markdownIt();
                  const tokens = md.parse(content, {});
                  const companyNames = [];

                  tokens.forEach(token => {
                    if (token.type === 'inline' && token.content) {
                      const doc = compromise(token.content);
                      const companies = doc.match('#Organization+').out('array');
                      companyNames.push(...companies.filter(name => name.trim()));
                    } else if (token.type === 'table_open') {
                      const tableData = tokens
                        .slice(tokens.indexOf(token), tokens.findIndex(t => t.type === 'table_close') + 1)
                        .filter(t => t.type === 'inline' || t.type === 'table_cell');
                      tableData.forEach(cell => {
                        if (cell.content) {
                          const doc = compromise(cell.content);
                          const companies = doc.match('#Organization+').out('array');
                          companyNames.push(...companies.filter(name => name.trim()));
                        }
                      });
                    }
                  });

                  const uniqueCompanies = [...new Set(companyNames)];
                  const logoMap = await inferDomains(uniqueCompanies); // Adjusted for in-memory caching

                  // Replace company names with names + logos in markdown
                  for (const [company, logoUrl] of Object.entries(logoMap)) {
                    if (logoUrl !== 'unknown') {
                      content = content.replace(new RegExp(`\\b${company}\\b`, 'g'), `[${company}](logo:${logoUrl})`);
                    }
                  }

                  const sanitizedResponseMessages = sanitizeResponseMessages({
                    messages: response.messages.map(m => m.id === response.messages[response.messages.length - 1]?.id ? { ...m, content } : m),
                    reasoning,
                  });

                  await saveMessages({ messages: sanitizedResponseMessages.map((message) => ({
                    id: message.id,
                    chatId: id,
                    role: message.role,
                    content: message.content,
                    createdAt: new Date(),
                  })) });
                } catch (error) {
                  console.error('Failed to save chat', error);
                }
              }
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
              experimental_transform: smoothStream({
                chunking: 'sentence',
              }),
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
