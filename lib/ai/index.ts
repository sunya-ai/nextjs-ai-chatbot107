import { openai } from '@ai-sdk/openai';
import { perplexity } from '@ai-sdk/perplexity';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

export const customModel = (apiIdentifier: string) => {
  const isPerplexity = apiIdentifier === 'sonar' || apiIdentifier === 'sonar-pro' || apiIdentifier === 'sonar-reasoning';
  
  if (isPerplexity) {
    return wrapLanguageModel({
      model: perplexity(apiIdentifier) as any,
      middleware: customMiddleware,
    });
  }

  return wrapLanguageModel({
    model: openai(apiIdentifier),
    middleware: customMiddleware,
  });
};
