import OpenAI from 'openai';
import { ContextEnhancer, EnhancerResponse } from './types';

// Tavily and Exa response interfaces
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

// Instantiate OpenAI and Perplexity clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai'
});

/**
 * withTimeout => wraps a promise in a race with a timeout
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
 * getPerplexityResponse => queries Perplexity via openai.chat.completions
 */
async function getPerplexityResponse(message: string): Promise<string> {
  try {
    console.log('[getPerplexityResponse] Querying Perplexity...');
    const response = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: `
You are a research assistant specializing in energy sector data.

SEARCH REQUIREMENTS
- Find ALL relevant deals/information
- Look for multiple confirming sources
- MUST include direct source URLs
- Minimum 10 verified results
- NO hallucination

SOURCE PRIORITY
1. Original press releases
2. Company investor relations
3. Company websites
4. Regulatory filings
5. Verified news sources

SOURCE HANDLING
- Include ALL source URLs for each item
- Cross-reference between sources
- Validate information across sources
- Include complete URLs only

CRITICAL RULES
- Every piece of information needs source URL
- Include ALL deal details available
- Use multiple sources when possible
- NO information without URL
- NO summarizing original sources
          `
        },
        {
          role: 'user',
          content: message
        }
      ]
    });
    console.log('[getPerplexityResponse] Perplexity response received');
    return response.choices[0].message.content || '';
  } catch (error) {
    console.error('[getPerplexityResponse] Perplexity error:', error);
    return '';
  }
}

/**
 * Minimal Tavily call => { "query": message }
 */
async function getTavilyResponse(message: string): Promise<string> {
  try {
    console.log('[getTavilyResponse] Starting Tavily search...');
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: message })
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = await response.json() as TavilyResponse;
    console.log('[getTavilyResponse] Tavily search complete =>', JSON.stringify(data, null, 2));

    if (!data.results || data.results.length === 0) {
      return data.answer ?? '[No Tavily results returned]';
    }

    // Format them
    const formatted = data.results
      .map((r) => `Source: ${r.url}\nTitle: ${r.title}\nContent: ${r.content}`)
      .join('\n\n');

    return data.answer 
      ? `Answer: ${data.answer}\n\n${formatted}`
      : formatted;
  } catch (error) {
    console.error('[getTavilyResponse] Tavily error:', error);
    return '';
  }
}

/**
 * Exa => guard for data.documents
 */
async function getExaResponse(message: string): Promise<string> {
  try {
    console.log('[getExaResponse] Starting Exa search...');
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.EXA_API_KEY!
      },
      body: JSON.stringify({
        query: message,
        contents: {
          text: { maxCharacters: 1000 }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Exa API error: ${response.status}`);
    }

    const data = await response.json() as ExaResponse;
    console.log('[getExaResponse] Exa raw data =>', JSON.stringify(data, null, 2));

    if (!data.documents || data.documents.length === 0) {
      console.warn('[getExaResponse] No documents returned => empty');
      return '';
    }

    const formatted = data.documents
      .map((doc) => `Source: ${doc.url}\nTitle: ${doc.title}\nContent: ${doc.text}`)
      .join('\n\n');

    console.log('[getExaResponse] Exa search complete => returning results');
    return formatted;
  } catch (error) {
    console.error('[getExaResponse] Exa error:', error);
    return '';
  }
}

/**
 * createAssistantsEnhancer => aggregator
 *   Expects "assistantId" => calls openai Beta with that ID
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

          // Tavily
          process.env.TAVILY_API_KEY
            ? withTimeout(getTavilyResponse(message), TIMEOUTS.tavily, 'Tavily')
            : Promise.resolve(''),

          // Exa
          process.env.EXA_API_KEY
            ? withTimeout(getExaResponse(message), TIMEOUTS.exa, 'Exa')
            : Promise.resolve('')
        ]);

        console.log('[enhance] Parallel calls completed => assembling results');

        // Combine results
        const results = {
          assistant: assistantResponse.status === 'fulfilled' ? assistantResponse.value : '',
          perplexity: perplexityResponse.status === 'fulfilled' ? perplexityResponse.value : '',
          tavily: tavilyResponse.status === 'fulfilled' ? tavilyResponse.value : '',
          exa: exaResponse.status === 'fulfilled' ? exaResponse.value : ''
        };

        // Join them into a single context
        const combinedContext = Object.entries(results)
          .filter(([_, val]) => val)
          .map(([service, val]) => `${service.charAt(0).toUpperCase() + service.slice(1)} Context:\n${val}`)
          .join('\n\n');

        // Build status
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
