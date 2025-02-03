import { openai } from '@ai-sdk/openai';
import { experimental_wrapLanguageModel as wrapLanguageModel, LanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

type SupportedProvider = 'openai' | 'perplexity';
type ModelIdentifier = `${SupportedProvider}-${string}`;

export const customModel = (apiIdentifier: ModelIdentifier): LanguageModel => {
  if (apiIdentifier.startsWith('perplexity-')) {
    return wrapLanguageModel({
      model: openai(apiIdentifier.replace('perplexity-', ''), {
        configuration: {
          baseURL: 'https://api.perplexity.ai',
          apiKey: process.env.PERPLEXITY_API_KEY ?? ''
        }
      }),
      middleware: customMiddleware,
    });
  }

  // Default to OpenAI
  return wrapLanguageModel({
    model: openai(apiIdentifier.replace('openai-', ''), {
      configuration: {
        apiKey: process.env.OPENAI_API_KEY
      }
    }),
    middleware: customMiddleware,
  });
}
