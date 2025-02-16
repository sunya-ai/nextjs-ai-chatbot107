import OpenAI from 'openai';
import { ContextEnhancer, EnhancerResponse } from './types';

// Initialize OpenAI clients for both services
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai'
});

// Timeout wrapper function
const withTimeout = async (promise: Promise<any>, timeoutMs: number, serviceName: string) => {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${serviceName} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
};

async function getPerplexityResponse(message: string): Promise<string> {
  try {
    console.log('🔍 Querying Perplexity...');
    const response = await perplexity.chat.completions.create({
      model: "sonar",
      messages: [
        {
          role: "system",
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
          role: "user",
          content: message
        }
      ]
    });
    
    console.log('✨ Perplexity response received');
    return response.choices[0].message.content || '';
  } catch (error) {
    console.error('❌ Perplexity error:', error);
    return '';
  }
}

async function getTavilyResponse(message: string): Promise<string> {
  try {
    console.log('🔎 Starting Tavily search...');
    
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: message,
        search_depth: "basic",
        max_results: 10,
        include_answer: true,
        include_raw_content: false
      })
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = await response.json();
    let formattedResponse = '';
    
    if (data.answer) {
      formattedResponse += `Answer: ${data.answer}\n\nSources:\n`;
    }

    formattedResponse += data.results
      .map(result => `Source: ${result.url}\nTitle: ${result.title}\nContent: ${result.content}`)
      .join('\n\n');

    console.log('✨ Tavily search complete');
    return formattedResponse;
  } catch (error) {
    console.error('❌ Tavily error:', error);
    return '';
  }
}

async function getExaResponse(message: string): Promise<string> {
  try {
    console.log('🔎 Starting Exa search...');
    
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

    const data = await response.json();
    const formattedResults = data.documents
      .map(doc => `Source: ${doc.url}\nTitle: ${doc.title}\nContent: ${doc.text}`)
      .join('\n\n');

    console.log('✨ Exa search complete');
    return formattedResults;
  } catch (error) {
    console.error('❌ Exa error:', error);
    return '';
  }
}

export const createAssistantsEnhancer = (assistantId: string): ContextEnhancer => {
  return {
    name: 'combined-enhancer',
    enhance: async (message: string): Promise<EnhancerResponse> => {
      try {
        // Set timeouts
        const TIMEOUTS = {
          assistant: 60000,    // 60 seconds
          perplexity: 30000,   // 30 seconds
          tavily: 30000,       // 30 seconds
          exa: 30000          // 30 seconds
        };

        // Run all API calls in parallel with timeouts
        const [assistantResponse, perplexityResponse, tavilyResponse, exaResponse] = 
          await Promise.allSettled([
            // Assistant API call
            withTimeout((async () => {
              console.log('🤖 Starting Assistant API call...');
              const thread = await openai.beta.threads.create();
              await openai.beta.threads.messages.create(thread.id, {
                role: 'user',
                content: message
              });

              const run = await openai.beta.threads.runs.create(thread.id, {
                assistant_id: assistantId
              });

              let completedRun = await openai.beta.threads.runs.retrieve(
                thread.id,
                run.id
              );

              while (completedRun.status === 'in_progress' || completedRun.status === 'queued') {
                await new Promise(resolve => setTimeout(resolve, 1000));
                completedRun = await openai.beta.threads.runs.retrieve(
                  thread.id,
                  run.id
                );
              }

              const messages = await openai.beta.threads.messages.list(thread.id);
              const assistantContent = messages.data[0].content[0];
              
              if ('text' in assistantContent) {
                return assistantContent.text.value;
              }
              return '';
            })(), TIMEOUTS.assistant, 'Assistant'),
            withTimeout(getPerplexityResponse(message), TIMEOUTS.perplexity, 'Perplexity'),
            process.env.TAVILY_API_KEY ? 
              withTimeout(getTavilyResponse(message), TIMEOUTS.tavily, 'Tavily') : 
              Promise.resolve(''),
            process.env.EXA_API_KEY ? 
              withTimeout(getExaResponse(message), TIMEOUTS.exa, 'Exa') : 
              Promise.resolve('')
          ]);

        // Combine all responses
        const results = {
          assistant: assistantResponse.status === 'fulfilled' ? assistantResponse.value : '',
          perplexity: perplexityResponse.status === 'fulfilled' ? perplexityResponse.value : '',
          tavily: tavilyResponse.status === 'fulfilled' ? tavilyResponse.value : '',
          exa: exaResponse.status === 'fulfilled' ? exaResponse.value : ''
        };

        // Combine contexts with clear separation
        const combinedContext = Object.entries(results)
          .filter(([_, value]) => value)
          .map(([service, value]) => `${service.charAt(0).toUpperCase() + service.slice(1)} Context:\n${value}`)
          .join('\n\n');

        // Record detailed status
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

        console.log('📊 Service Status:', JSON.stringify(status, null, 2));

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
        console.error('❌ Enhancement error:', error);
        return {
          enhancedContext: '',
          metadata: { 
            error: 'Failed to enhance with services',
            errorDetails: error.message
          }
        };
      }
    }
  };
};
