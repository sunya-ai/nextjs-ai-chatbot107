import { openai } from '@ai-sdk/openai';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

export const customModel = (apiIdentifier: string) => {
  const isPerplexity = apiIdentifier.startsWith('sonar');
  
  if (isPerplexity) {
    return wrapLanguageModel({
      model: openai(apiIdentifier, {
        endpoint: 'https://api.perplexity.ai/v1/chat/completions',
        apiKey: process.env.PERPLEXITY_API_KEY
      }),
      middleware: customMiddleware,
    });
  }

  return wrapLanguageModel({
    model: openai(apiIdentifier),
    middleware: customMiddleware,
  });
};
