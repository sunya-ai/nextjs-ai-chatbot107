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

export const createAssistantsEnhancer = (assistantId: string): ContextEnhancer => {
  return {
    name: 'combined-enhancer',
    enhance: async (message: string): Promise<EnhancerResponse> => {
      try {
        // Run both API calls in parallel
        const [assistantResponse, perplexityResponse] = await Promise.allSettled([
          // Assistant API call
          (async () => {
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
          })(),
          // Perplexity API call
          getPerplexityResponse(message)
        ]);

        // Combine responses
        const assistantText = assistantResponse.status === 'fulfilled' ? assistantResponse.value : '';
        const perplexityText = perplexityResponse.status === 'fulfilled' ? perplexityResponse.value : '';

        // Combine contexts with clear separation
        const combinedContext = [
          assistantText && `Assistant Context:\n${assistantText}`,
          perplexityText && `Perplexity Context:\n${perplexityText}`
        ].filter(Boolean).join('\n\n');

        return {
          enhancedContext: combinedContext,
          metadata: {
            assistantStatus: assistantResponse.status,
            perplexityStatus: perplexityResponse.status
          }
        };
      } catch (error) {
        console.error('❌ Enhancement error:', error);
        return {
          enhancedContext: '',
          metadata: { error: 'Failed to enhance with either service' }
        };
      }
    }
  };
};
