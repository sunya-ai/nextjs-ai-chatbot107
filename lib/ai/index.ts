import { openai } from '@ai-sdk/openai';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from './custom-middleware';

export const customModel = (apiIdentifier: string) => {
  // If it's a DeepSeek model, temporarily swap the API key
  const isDeepSeek = apiIdentifier.startsWith('deepseek-');
  const originalKey = process.env.OPENAI_API_KEY;
  
  if (isDeepSeek) {
    process.env.OPENAI_API_KEY = process.env.DEEPSEEK_API_KEY;
  }

  const model = wrapLanguageModel({
    model: openai(apiIdentifier),
    middleware: customMiddleware,
  });

  // Restore original OpenAI key
  if (isDeepSeek) {
    process.env.OPENAI_API_KEY = originalKey;
  }

  return model;
};
