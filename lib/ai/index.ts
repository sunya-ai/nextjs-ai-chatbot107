import { openai } from '@ai-sdk/openai';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

export const customModel = (apiIdentifier: string) => {
  // If it's a DeepSeek model, configure exactly like their Node.js example
  const isDeepSeek = apiIdentifier.startsWith('deepseek-');
  
  if (isDeepSeek) {
    const config = {
      baseURL: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY,
      defaultQuery: { stream: true }
    };
    
    return wrapLanguageModel({
      model: openai(apiIdentifier, { configuration: config } as any),
      middleware: customMiddleware,
    });
  }

  // Keep existing OpenAI handling exactly as is
  return wrapLanguageModel({
    model: openai(apiIdentifier),
    middleware: customMiddleware,
  });
};
