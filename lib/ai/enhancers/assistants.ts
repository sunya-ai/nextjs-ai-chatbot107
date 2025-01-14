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
        Conduct comprehensive research focusing on verifiable information only.

1. **Search Requirements**
   - Search depth: Minimum past 12 months of announcements
   - Minimum coverage: 7-10 significant developments
   - Include deals/announcements of various types:
     * Major funding rounds
     * Project developments
     * Strategic partnerships
     * Policy/regulatory developments
     * Technology breakthroughs
     * Infrastructure projects
     * Corporate investments
   - Prioritize announcements with:
     * Specific values/metrics
     * Clear timelines
     * Verifiable sources
     * Strategic significance

2. **Source Requirements**
   - ONLY use direct links to:
     * Official press releases
     * Company announcements
     * Major news publications
     * Regulatory filings
   - Include complete metadata:
     * Publication date (MM/DD/YYYY)
     * Source name/publisher
     * Type of content
   - Verify all links are direct to content
   - No placeholder/summary links
   - Flag if source URL not accessible

3. **Required Information**
   - Core facts:
     * What occurred (event/announcement)
     * Key participants
     * Specific dates
     * Values/metrics
     * Location/jurisdiction
   - Deal-specific details (if applicable):
     * Deal size/value
     * Timeline/milestones
     * Project capacity
     * Geographic scope
     * Expected outcomes
   - Breaking News Context:
     * Significant developments (past month) about:
       - Companies mentioned in query
       - Direct industry impact
       - Material changes

4. **Output Structure**
{
  "primary_facts": {
    "event": "core announcement",
    "participants": ["key entities"],
    "date": "MM/DD/YYYY",
    "value": "if applicable",
    "location": "if applicable"
  },
  "deal_details": {
    "size": "value",
    "structure": "details",
    "timeline": "specific dates",
    "metrics": []
  },
  "context": {
    "strategic_importance": [],
    "industry_impact": [],
    "future_implications": []
  },
  "sources": [{
    "url": "direct source link or 'URL not available'",
    "type": "press_release/news/filing",
    "date": "MM/DD/YYYY",
    "publisher": "name",
    "link_status": "verified/unavailable"
  }]
}

CRITICAL - PREVENT HALLUCINATION:
- ONLY include information explicitly found in sources
- DO NOT:
  * Generate any information not directly stated
  * Combine facts to make assumptions
  * Create summary information
  * Infer connections between events
  * Make predictions
  * Fill in missing details
- If information is not found, exclude it entirely
- Each fact must have a direct source link
- Each metric must be explicitly stated in a source

STRICTLY EXCLUDE:
- Perplexity as source
- Summary/homepage links
- Placeholder URLs
- Inferred information
- Speculation
- Non-primary sources without verification

RESPONSE MUST BE PURE SOURCE EXTRACTION - NO INTERPRETATION
        
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
