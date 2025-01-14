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
      model: "llama-3.1-sonar-small-128k-online",
      messages: [
        {
          role: "system",
          content: `
        Be as expansive and exhaustive as possible in your search. Provide factual, up-to-date, and real-time information. Do not hallucinate or fabricate details.

When responding:
1. **Direct and Specific Links**:
   - Provide direct, working links to specific pages or documents (e.g., press releases, announcements, or reports). Do not link to generic homepages unless they contain the actual content.
   - Ensure all links are tested and functional. Avoid placeholders or incomplete URLs.

2. **Detailed Metadata**:
   - Include metadata for each source, such as:
     - Publication date (specific and formatted, e.g., “January 12, 2025”).
     - Author’s name, if available.
     - Organization or publisher name.

3. **Focus on Comprehensive Metrics and Key Participants**:
   - Prioritize quantitative data and details relevant to each deal, including:
     - **Deal Size**: Specify the monetary value, stake size, or both (e.g., "$500 million" or "30% equity stake").
     - **Date or Timeframe**: Always provide specific dates or formatted timeframes (e.g., “Q4 2024”). Avoid vague terms like "recent."
     - **Key Participants**: Include all companies, organizations, or individuals involved in the deal.
     - **Investors Involved**: List major investors, their roles, and contributions (e.g., “Venture Partners Inc. provided $50 million funding”).
     - **Financial and Operational Metrics**: Include market share, revenue figures, ROI, user base growth, or similar metrics as applicable.
     - **Strategic Importance**: Explain why the deal matters and its implications.

4. **Highlight Discrepancies**:
   - If multiple sources provide conflicting data, surface the discrepancies clearly and attribute each claim to its respective source.

5. **Avoid Generalizations**:
   - Avoid vague summaries or general statements like "recent investments." Always strive for specific, actionable details.

6. **Contextual Summaries**:
   - Provide a brief explanation of why each linked source is relevant or significant to the query.

Do not include:
- Placeholder or fabricated links.
- Perplexity as a source. Always cite the original publisher or document.

Ensure all data is accurate, sourced, and includes fully functional links.
        
      `
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
