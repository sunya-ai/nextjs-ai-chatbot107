import { openai } from '@ai-sdk/openai';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

export const customModel = (apiIdentifier: string) => {
  const isPerplexity = apiIdentifier.startsWith('sonar');
  
  if (isPerplexity) {
    return wrapLanguageModel({
      model: openai(apiIdentifier, {
        configuration: {
          baseURL: 'https://api.perplexity.ai/v1',
          apiKey: process.env.PERPLEXITY_API_KEY
        }
      } as any),
      middleware: customMiddleware,
    });
  }

  return wrapLanguageModel({
    model: openai(apiIdentifier),
    middleware: customMiddleware,
  });
};
