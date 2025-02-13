import { openai } from '@ai-sdk/openai';
import { perplexity } from '@ai-sdk/perplexity';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

// Create the Google AI provider instance
const googleAI = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export const customModel = (apiIdentifier: string) => {
  const isPerplexity = apiIdentifier === 'sonar' || apiIdentifier === 'sonar-pro' || apiIdentifier === 'sonar-reasoning';
  const isGemini = apiIdentifier === 'gemini-2.0-pro-exp-02-05';
  
  if (isPerplexity) {
    return wrapLanguageModel({
      model: perplexity(apiIdentifier) as any,
      middleware: customMiddleware,
    });
  }

  if (isGemini) {
    return wrapLanguageModel({
      model: googleAI('gemini-2.0-pro-exp-02-05', {
        useSearchGrounding: true
      }) as any,
      middleware: customMiddleware,
    });
  }
  
  return wrapLanguageModel({
    model: openai(apiIdentifier),
    middleware: customMiddleware,
  });
};
