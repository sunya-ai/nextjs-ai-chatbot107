import { openai } from '@ai-sdk/openai';
import { createPerplexity } from '@ai-sdk/perplexity';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

const perplexityClient = createPerplexity({
  apiKey: process.env.PERPLEXITY_API_KEY ?? ''
});

export const customModel = (apiIdentifier: string) => {
  const isPerplexity = apiIdentifier === 'sonar' || apiIdentifier === 'sonar-pro';
  
  if (isPerplexity) {
    return wrapLanguageModel({
      model: perplexityClient(apiIdentifier),
      middleware: customMiddleware,
    });
  }

  return wrapLanguageModel({
    model: openai(apiIdentifier),
    middleware: customMiddleware,
  });
};
