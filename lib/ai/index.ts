import { openai } from '@ai-sdk/openai';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

export const customModel = (apiIdentifier: string) => {
  const isDeepSeek = apiIdentifier.startsWith('deepseek-');
  
  return wrapLanguageModel({
    model: openai(apiIdentifier, isDeepSeek ? {
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY
    } : undefined),
    middleware: customMiddleware,
  });
};
