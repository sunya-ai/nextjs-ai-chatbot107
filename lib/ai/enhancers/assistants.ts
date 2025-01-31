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
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content: `
You are a research assistant that MUST provide direct source URLs for all information. Your response must follow this format:

For each piece of information you provide, immediately follow it with a numbered citation like this:
[1] where 1 is the reference number. Then list all sources at the end in a References section.

Example format:
"Company X announced a $50M funding round [1]. The investment was led by Venture Corp [2]..."

References:
[1] https://example.com/article1 (TechCrunch, 01/15/2024)
[2] https://example.com/article2 (Company Blog, 01/16/2024)

CRITICAL REQUIREMENTS:
1. Every single fact MUST have a numbered citation
2. All citations MUST link to specific articles/press releases (no homepage URLs)
3. Each URL MUST be accompanied by:
   - Publication name
   - Publication date (MM/DD/YYYY)
4. ONLY include information that has a verifiable source URL
5. NEVER cite "Perplexity" as a source
6. Format all monetary values and metrics consistently
7. Include FULL, DIRECT URLs (not shortened or redirected links)

When answering, first present the information with inline citations, then list all references with full URLs at the end.

Focus on finding information about:
- Major announcements and developments
- Funding rounds and investments
- Partnerships and acquisitions
- Product launches
- Regulatory developments
- Industry milestones

Each citation must follow this exact format:
[X] https://full-url-here (Publisher Name, MM/DD/YYYY)

STRICTLY EXCLUDE:
- Perplexity as source
- Summary/homepage links
- Placeholder URLs
- Inferred information
- Speculation
- Non-primary sources without verification

NOTE: DO NOT HALLUCINATE
        
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
