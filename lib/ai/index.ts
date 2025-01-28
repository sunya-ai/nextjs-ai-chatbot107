import { openai } from '@ai-sdk/openai';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

export const customModel = (apiIdentifier: string) => {
  // If it's a DeepSeek model, temporarily swap the API key
  const isDeepSeek = apiIdentifier.startsWith('deepseek-');
  
  if (isDeepSeek) {
    const originalKey = process.env.OPENAI_API_KEY;
    const originalUrl = process.env.OPENAI_API_BASE_URL;
    
    process.env.OPENAI_API_KEY = process.env.DEEPSEEK_API_KEY;
    process.env.OPENAI_API_BASE_URL = 'https://api.deepseek.com/v1';
    
    const model = wrapLanguageModel({
      model: openai(apiIdentifier),
      middleware: customMiddleware,
    });
    
    // Restore original values
    process.env.OPENAI_API_KEY = originalKey;
    process.env.OPENAI_API_BASE_URL = originalUrl;
    
    return model;
  }

  // Default OpenAI handling
  return wrapLanguageModel({
    model: openai(apiIdentifier),
    middleware: customMiddleware,
  });
};
