import { openai } from '@ai-sdk/openai';
import { experimental_wrapLanguageModel as wrapLanguageModel, LanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

export const customModel = (apiIdentifier: string): LanguageModel => {
  if (apiIdentifier.startsWith('perplexity-')) {
    return wrapLanguageModel({
      model: openai(apiIdentifier.replace('perplexity-', ''), {
        baseURL: 'https://api.perplexity.ai',
        apiKey: process.env.PERPLEXITY_API_KEY ?? ''
      }),
      middleware: customMiddleware,
    });
  }

  return wrapLanguageModel({
    model: openai(apiIdentifier, {
      apiKey: process.env.OPENAI_API_KEY
    }),
    middleware: customMiddleware,
  });
}
