import { OpenAI } from 'openai';
import { ContextEnhancer, EnhancerResponse } from './types';

// API Response Interfaces
interface TavilyResult {
  url: string;
  title: string;
  content: string;
}

interface TavilyResponse {
  answer?: string;
  results?: TavilyResult[];
}

interface ExaDocument {
  url: string;
  title: string;
  text: string;
}

interface ExaResponse {
  documents?: ExaDocument[];
}

// Initialize API Clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai'
});

/**
 * withTimeout => Wraps a promise with a timeout
 */
const withTimeout = async (promise: Promise<any>, timeoutMs: number, serviceName: string) => {
  console.log(`[withTimeout] Start => ${serviceName}, timeout = ${timeoutMs}ms`);
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      console.error(`[withTimeout] ${serviceName} => TIMEOUT after ${timeoutMs}ms`);
      reject(new Error(`${serviceName} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    console.log(`[withTimeout] ${serviceName} => success under timeout`);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    console.error(`[withTimeout] ${serviceName} => error:`, error);
    throw error;
  }
};

/**
 * getPerplexityResponse => Queries Perplexity 
 */
async function getPerplexityResponse(message: string): Promise<string> {
  try {
    console.log('[getPerplexityResponse] Starting Perplexity search...');
    const response = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: `You are a research assistant. Find relevant, factual information with source URLs.
Key requirements:
- Include source URLs for all information
- Use multiple sources when possible
- Validate across sources
- No information without URL sources`
        },
        { role: 'user', content: message }
      ]
    });
    console.log('[getPerplexityResponse] Perplexity response received');
    return response.choices[0].message.content || '';
  } catch (error) {
    console.error('[getPerplexityResponse] Perplexity error:', error);
    return `[Perplexity Search Failed: ${error instanceof Error ? error.message : String(error)}]`;
  }
}

/**
 * getTavilyResponse => Tavily search API implementation
 */
async function getTavilyResponse(message: string): Promise<string> {
  try {
    if (!message.trim()) {
      console.error('[getTavilyResponse] Empty query string provided');
      return '[No query provided for Tavily search]';
    }

    if (message.length > 400) {
      console.warn('[getTavilyResponse] Query too long, truncating to 400 chars');
      message = message.slice(0, 400);
    }

    console.log('[getTavilyResponse] Starting Tavily search with query:', message.slice(0, 100));
    
    const requestBody = {
      query: message,
      search_depth: "advanced",
      include_answer: true,
      max_results: 5
    };

    console.log('[getTavilyResponse] Request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[getTavilyResponse] Response not OK:', {
        status: response.status,
        statusText: response.statusText,
        errorText,
        headers: Object.fromEntries(response.headers.entries())
      });
      throw new Error(`Tavily API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as TavilyResponse;
    console.log('[getTavilyResponse] Tavily search complete =>', JSON.stringify(data, null, 2));

    if (!data.results || data.results.length === 0) {
      return data.answer ?? '[No Tavily results returned]';
    }

    const formatted = data.results
      .map((r, i) => `[Source ${i + 1}]\nURL: ${r.url}\nTitle: ${r.title}\n\n${r.content}`)
      .join('\n\n---\n\n');

    return data.answer 
      ? `Tavily Summary: ${data.answer}\n\nDetailed Sources:\n${formatted}`
      : formatted;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[getTavilyResponse] Detailed error:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      tavilyKey: process.env.TAVILY_API_KEY ? 'Present' : 'Missing'
    });
    return `[Tavily Search Failed: ${errorMessage}]`;
  }
}

/**
 * getExaResponse => Exa search API implementation
 */
async function getExaResponse(message: string): Promise<string> {
  try {
    if (!message.trim()) {
      console.error('[getExaResponse] Empty query string provided');
      return '[No query provided for Exa search]';
    }

    console.log('[getExaResponse] Starting Exa search with query:', message.slice(0, 100));
    
    const requestBody = {
      query: message,
      contents: {
        text: { maxCharacters: 1000 }
      }
    };

    console.log('[getExaResponse] Request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.EXA_API_KEY!
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[getExaResponse] Response not OK:', {
        status: response.status,
        statusText: response.statusText,
        errorText,
        headers: Object.fromEntries(response.headers.entries())
      });
      throw new Error(`Exa API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as ExaResponse;
    console.log('[getExaResponse] Exa raw data =>', JSON.stringify(data, null, 2));

    if (!data.documents || data.documents.length === 0) {
      console.warn('[getExaResponse] No documents returned');
      return '[No Exa results returned]';
    }

    const formatted = data.documents
      .map((doc, i) => `[Source ${i + 1}]\nURL: ${doc.url}\nTitle: ${doc.title}\n\n${doc.text}`)
      .join('\n\n---\n\n');

    console.log('[getExaResponse] Exa search complete => returning results');
    return formatted;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[getExaResponse] Detailed error:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      exaKey: process.env.EXA_API_KEY ? 'Present' : 'Missing'
    });
    return `[Exa Search Failed: ${errorMessage}]`;
  }
}

/**
 * createAssistantsEnhancer => Main enhancer factory function
 */
export const createAssistantsEnhancer = (assistantId: string): ContextEnhancer => {
  return {
    name: 'combined-enhancer',
    enhance: async (message: string): Promise<EnhancerResponse> => {
      console.log('[enhance] aggregator => called with message (first 100 chars):', message.slice(0, 100));
      try {
        const TIMEOUTS = {
          assistant: 60000,
          perplexity: 30000,
          tavily: 30000,
          exa: 30000
        };

        // Check API keys before starting
        if (!process.env.TAVILY_API_KEY) {
          console.warn('[enhance] ⚠️ Tavily API key not found - skipping Tavily search');
        }
        if (!process.env.EXA_API_KEY) {
          console.warn('[enhance] ⚠️ Exa API key not found - skipping Exa search');
        }

        console.log('[enhance] Starting parallel calls => assistant, perplexity, tavily, exa');

        const [assistantResponse, perplexityResponse, tavilyResponse, exaResponse] = await Promise.allSettled([
          // Assistant
          withTimeout((async () => {
            console.log('[enhance] => 🤖 Starting Assistant API call...');
            const thread = await openai.beta.threads.create();
            await openai.beta.threads.messages.create(thread.id, {
              role: 'user',
              content: message
            });

            const run = await openai.beta.threads.runs.create(thread.id, {
              assistant_id: assistantId
            });

            let completedRun = await openai.beta.threads.runs.retrieve(thread.id, run.id);

            while (completedRun.status === 'in_progress' || completedRun.status === 'queued') {
              console.log('[enhance] => assistant is in_progress/queued, waiting 1s');
              await new Promise(res => setTimeout(res, 1000));
              completedRun = await openai.beta.threads.runs.retrieve(thread.id, run.id);
            }

            const messages = await openai.beta.threads.messages.list(thread.id);
            const assistantContent = messages.data[0]?.content[0];

            console.log('[enhance] => assistant completed, content length:', messages.data[0]?.content?.length ?? 0);
            if (assistantContent && 'text' in assistantContent) {
              return assistantContent.text.value;
            }
            return '';
          })(), TIMEOUTS.assistant, 'Assistant'),

          // Perplexity
          withTimeout(getPerplexityResponse(message), TIMEOUTS.perplexity, 'Perplexity'),

          // Tavily (with API key check)
          process.env.TAVILY_API_KEY
            ? withTimeout(getTavilyResponse(message), TIMEOUTS.tavily, 'Tavily')
            : Promise.resolve('[Tavily API key not configured]'),

          // Exa (with API key check)
          process.env.EXA_API_KEY
            ? withTimeout(getExaResponse(message), TIMEOUTS.exa, 'Exa')
            : Promise.resolve('[Exa API key not configured]')
        ]);

        console.log('[enhance] Parallel calls completed => assembling results');

        // Combine results
        const results = {
          assistant: assistantResponse.status === 'fulfilled' ? assistantResponse.value : '',
          perplexity: perplexityResponse.status === 'fulfilled' ? perplexityResponse.value : '',
          tavily: tavilyResponse.status === 'fulfilled' ? tavilyResponse.value : '',
          exa: exaResponse.status === 'fulfilled' ? exaResponse.value : ''
        };

        // Join them into a single context with markdown formatting
        const combinedContext = Object.entries(results)
          .filter(([_, val]) => val)
          .map(([service, val]) => `### ${service.charAt(0).toUpperCase() + service.slice(1)} Results\n${val}`)
          .join('\n\n');

        // Build detailed status
        const status = {
          assistant: {
            status: assistantResponse.status,
            error: assistantResponse.status === 'rejected' ? assistantResponse.reason?.message : null,
            responseReceived: !!results.assistant
          },
          perplexity: {
            status: perplexityResponse.status,
            error: perplexityResponse.status === 'rejected' ? perplexityResponse.reason?.message : null,
            responseReceived: !!results.perplexity
          },
          tavily: {
            enabled: !!process.env.TAVILY_API_KEY,
            status: tavilyResponse.status,
            error: tavilyResponse.status === 'rejected' ? tavilyResponse.reason?.message : null,
            responseReceived: !!results.tavily
          },
          exa: {
            enabled: !!process.env.EXA_API_KEY,
            status: exaResponse.status,
            error: exaResponse.status === 'rejected' ? exaResponse.reason?.message : null,
            responseReceived: !!results.exa
          }
        };

        console.log('[enhance] 📊 Service Status =>', JSON.stringify(status, null, 2));

        return {
          enhancedContext: combinedContext,
          metadata: {
            assistantStatus: assistantResponse.status,
            perplexityStatus: perplexityResponse.status,
            tavilyStatus: tavilyResponse.status,
            exaStatus: exaResponse.status,
            serviceStatus: status
          }
        };
      } catch (error) {
        console.error('❌ [enhance] Enhancement error:', error);
        return {
          enhancedContext: '',
          metadata: {
            error: 'Failed to enhance with services',
            errorDetails: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
  };
};
