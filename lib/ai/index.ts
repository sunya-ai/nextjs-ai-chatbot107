import { openai } from '@ai-sdk/openai';
import { perplexity, createPerplexity } from '@ai-sdk/perplexity';
import { experimental_wrapLanguageModel as wrapLanguageModel, LanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

type SupportedProvider = 'openai' | 'perplexity';
type ModelIdentifier = `${SupportedProvider}-${string}`;

export const customModel = (apiIdentifier: ModelIdentifier): LanguageModel => {
  if (apiIdentifier.startsWith('openai-')) {
    return wrapLanguageModel({
      model: openai(apiIdentifier.replace('openai-', ''), {
        configuration: {
          apiKey: process.env.OPENAI_API_KEY
        }
      }),
      middleware: customMiddleware,
    });
  }

  if (apiIdentifier.startsWith('perplexity-')) {
    const perplexityClient = createPerplexity({
      apiKey: process.env.PERPLEXITY_API_KEY ?? '',
    });
    
    return wrapLanguageModel({
      model: perplexityClient(apiIdentifier.replace('perplexity-', '')),
      middleware: customMiddleware,
    });
  }

  throw new Error(`Unsupported API identifier: ${apiIdentifier}`);
}
