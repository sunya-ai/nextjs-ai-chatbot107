// lib/ai/enhancers/assistants.ts
import { OpenAI } from 'openai';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { z } from 'zod'; // For structured outputs
import { Perplexity } from '@ai-sdk/perplexity'; // For Perplexity integration

export type EnhancerResponse = {
  text: string;
  reasoning: string[];
  sources: { title: string; url: string }[];
};

export const createAssistantsEnhancer = (assistantId: string): ((message: string, fileBuffer?: ArrayBuffer, fileMime?: string) => Promise<EnhancerResponse>) => {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const perplexity = new OpenAI({
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseURL: 'https://api.perplexity.ai',
  });

  return async (message: string, fileBuffer?: ArrayBuffer, fileMime?: string): Promise<EnhancerResponse> => {
    console.log('[assistants] Starting context enhancement for message (first 100 chars):', message.slice(0, 100));

    const enhancementPrompt = `
You are an energy research context enhancer. Refine and enrich the user's query or context for energy sector analysis, processing any uploaded file to extract key details. Your goal is to provide a comprehensive, data-rich foundation for energy finance analysis, focusing on transactions, companies, and financial metrics.

If a file is provided, extract key text (max 10,000 characters) and summarize:
- Identify energy transactions (e.g., solar M&A, oil trends, geothermal deals).
- Extract dates, companies, amounts, and deal types.

Format your response as:
Refined Context: [enriched query or context for energy sector analysis]
Reasoning: [step-by-step reasoning for refinement and enrichment]
Sources: [list of relevant sources with titles and URLs]

Keep it concise, data-focused, and exclude file content from long-term storage.
If the query or file seems unrelated to energy, find relevant energy sector angles or return the original query with minimal reasoning.
`;

    const contentParts: any[] = [
      {
        type: 'text',
        text: message,
      },
    ];

    if (fileBuffer) {
      console.log('[assistants] Processing file, mime:', fileMime);
      contentParts.push({
        type: 'file',
        data: fileBuffer,
        mimeType: fileMime || 'application/pdf',
      });
    }

    try {
      // Step 1: Initial enhancement with Gemini Flash 2.0 (non-streaming)
      console.log('[assistants] Step 1: Initial enhancement with Gemini Flash 2.0');
      const initialResult = await generateText({
        model: google('gemini-2.0-flash', {
          useSearchGrounding: true,
          structuredOutputs: true,
        }),
        system: enhancementPrompt,
        messages: [{ role: 'user', content: contentParts }],
        schema: z.object({
          text: z.string().describe('Refined context for energy sector analysis'),
          reasoning: z.array(z.string()).describe('Step-by-step reasoning for refinement'),
          sources: z.array(z.object({
            title: z.string(),
            url: z.string().url(),
          })).describe('Relevant sources'),
        }),
      });

      const { text: initialText, reasoning: initialReasoning, sources: initialSources } = initialResult;
      console.log('[assistants] Gemini Flash 2.0 completed, initial text length:', initialText.length);

      // Step 2: Perplexity search for additional sources (non-streaming)
      console.log('[assistants] Step 2: Perplexity search for:', initialText.slice(0, 100));
      const perplexityResult = await generateText({
        model: Perplexity('sonar-large'),
        prompt: `Perform a search for energy sector information related to: ${initialText}. Return only sources with titles and URLs.`,
        schema: z.object({
          sources: z.array(z.object({
            title: z.string(),
            url: z.string().url(),
          })),
        }),
      });

      const perplexitySources = perplexityResult.sources || [];
      console.log('[assistants] Perplexity search completed, sources count:', perplexitySources.length);

      // Step 3: Ground with Gemini 2.0 Pro (non-streaming)
      console.log('[assistants] Step 3: Grounding with Gemini 2.0 Pro');
      const groundingPrompt = `
Ground the following context in energy sector analysis using the provided sources. Return:
- Text: [grounded and enriched context]
- Reasoning: [step-by-step reasoning for grounding]

Context: ${initialText}
Sources: ${JSON.stringify([...initialSources, ...perplexitySources])}
`;

      const groundingResult = await generateText({
        model: google('gemini-2.0-pro', {
          useSearchGrounding: true,
          structuredOutputs: true,
        }),
        prompt: groundingPrompt,
        schema: z.object({
          text: z.string().describe('Grounded and enriched context'),
          reasoning: z.array(z.string()).describe('Step-by-step reasoning for grounding'),
        }),
      });

      const { text: groundedText, reasoning: groundingReasoning } = groundingResult;
      console.log('[assistants] Gemini 2.0 Pro grounding completed, text length:', groundedText.length);

      // Step 4: OpenAI Assistants enhancement (optional, non-streaming)
      console.log('[assistants] Step 4: Enhancing with OpenAI Assistants');
      const assistantThread = await openai.beta.threads.create();
      await openai.beta.threads.messages.create(assistantThread.id, {
        role: 'user',
        content: initialText,
      });
      const assistantRun = await openai.beta.threads.runs.create(assistantThread.id, {
        assistant_id: assistantId,
      });

      let assistantRunStatus = await openai.beta.threads.runs.retrieve(assistantThread.id, assistantRun.id);
      while (assistantRunStatus.status === 'in_progress' || assistantRunStatus.status === 'queued') {
        console.log('[assistants] OpenAI Assistants in progress/queued, waiting 1s...');
        await new Promise(res => setTimeout(res, 1000));
        assistantRunStatus = await openai.beta.threads.runs.retrieve(assistantThread.id, assistantRun.id);
      }

      const assistantMessages = await openai.beta.threads.messages.list(assistantThread.id);
      const assistantContent = assistantMessages.data[0]?.content[0]?.text?.value || '';
      console.log('[assistants] OpenAI Assistants completed, content length:', assistantContent.length);

      const assistantReasoning = ['Enhancing context with Assistants...', 'Integrating assistant insights...'];
      const assistantSources = extractSourcesFromResponse(assistantContent) || [];

      // Combine results
      const combinedText = groundedText || assistantContent || initialText;
      const combinedReasoning = [...initialReasoning, ...groundingReasoning, ...assistantReasoning];
      const combinedSources = [...new Set([...initialSources, ...perplexitySources, ...assistantSources].map(s => JSON.stringify(s)))].map(s => JSON.parse(s));
      console.log('[assistants] Context enhancement completed, final text length:', combinedText.length, 'reasoning steps:', combinedReasoning.length, 'sources count:', combinedSources.length);

      return { text: combinedText, reasoning: combinedReasoning, sources: combinedSources };
    } catch (error) {
      console.error('[assistants] Enhancement error:', error instanceof Error ? error.message : String(error));
      return { text: message, reasoning: [], sources: [] };
    }
  };
};

// Helper to extract sources from text (simplified, adjust based on output)
function extractSourcesFromResponse(context: string): { title: string; url: string }[] {
  console.log('[assistants] Extracting sources from context (first 100 chars):', context.slice(0, 100));
  const urlRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
  const matches = [...context.matchAll(urlRegex)];
  const sources = matches.map(match => ({
    title: match[1] || 'Unknown Source',
    url: match[2],
  }));
  console.log('[assistants] Extracted sources count:', sources.length);
  return sources;
}
