import { openai } from '@ai-sdk/openai';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

export const customModel = (apiIdentifier: string) => {
  const isDeepSeek = apiIdentifier.startsWith('deepseek-');
  
  const options = isDeepSeek ? {
    configuration: {
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY || ''
    }
  } : undefined;

  return wrapLanguageModel({
    model: openai(apiIdentifier as any, options),
    middleware: customMiddleware,
  });
};
