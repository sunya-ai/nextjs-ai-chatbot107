import { openai } from '@ai-sdk/openai';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

export const customModel = (apiIdentifier: string) => {
  const isDeepSeek = apiIdentifier.startsWith('deepseek-');
  
  if (isDeepSeek) {
    // Create custom fetch for DeepSeek
    const customFetch = (url: RequestInfo, init?: RequestInit) => {
      return fetch('https://api.deepseek.com/v1/chat/completions', {
        ...init,
        headers: {
          ...init?.headers,
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        }
      });
    };

    return wrapLanguageModel({
      model: openai(apiIdentifier as any, { fetch: customFetch }),
      middleware: customMiddleware,
    });
  }

  // Default OpenAI handling
  return wrapLanguageModel({
    model: openai(apiIdentifier),
    middleware: customMiddleware,
  });
};
