import { openai } from '@ai-sdk/openai';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

export const customModel = (apiIdentifier: string) => {
  const isDeepSeek = apiIdentifier.startsWith('deepseek-');
  
  // For DeepSeek models, create a separate client with custom fetch
  if (isDeepSeek) {
    const settings = {
      fetch: async (url: string, init?: RequestInit) => {
        return fetch('https://api.deepseek.com/v1' + url.replace('https://api.openai.com/v1', ''), {
          ...init,
          headers: {
            ...init?.headers,
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          },
        });
      }
    };
    return wrapLanguageModel({
      model: openai(apiIdentifier as any, settings),
      middleware: customMiddleware,
    });
  }

  // Default OpenAI handling
  return wrapLanguageModel({
    model: openai(apiIdentifier),
    middleware: customMiddleware,
  });
};
