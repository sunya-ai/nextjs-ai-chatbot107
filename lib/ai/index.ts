import { openai } from '@ai-sdk/openai';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

export const customModel = (apiIdentifier: string) => {
  const isDeepSeek = apiIdentifier.startsWith('deepseek-');
  
  if (isDeepSeek) {
    return wrapLanguageModel({
      model: openai(apiIdentifier, {
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: process.env.DEEPSEEK_API_KEY
      }),
      middleware: customMiddleware,
    });
  }

  // Default OpenAI handling
  return wrapLanguageModel({
    model: openai(apiIdentifier),
    middleware: customMiddleware,
  });
};
