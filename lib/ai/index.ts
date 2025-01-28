import { openai } from '@ai-sdk/openai';
import { deepseek } from '@ai-sdk/deepseek';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

export const customModel = (apiIdentifier: string) => {
  // Check if it's a DeepSeek model
  const isDeepSeek = apiIdentifier.startsWith('deepseek-');
  
  if (isDeepSeek) {
    return wrapLanguageModel({
      model: deepseek(apiIdentifier),
      middleware: customMiddleware,
    });
  }

  // Default OpenAI handling remains unchanged
  return wrapLanguageModel({
    model: openai(apiIdentifier),
    middleware: customMiddleware,
  });
};
