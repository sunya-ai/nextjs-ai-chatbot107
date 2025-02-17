/* =========================================
   models.ts
   ========================================= */

import { google } from '@ai-sdk/google';
import { perplexity } from '@ai-sdk/perplexity';
import { openai } from '@ai-sdk/openai';
import { customProvider } from 'ai';

// 1. Default model (Gemini small)
export const DEFAULT_CHAT_MODEL = 'chat-model-small';

// 2. Create the Provider
export const myProvider = customProvider({
  languageModels: {
    // Small Model: Gemini 2.0 Flash with Google Search Grounding
    'chat-model-small': google('gemini-2.0-flash', {
      useSearchGrounding: true,
    }),

    // Large Model: Gemini 2.0 Pro Exp 02-05 with Google Search Grounding
    'chat-model-large': google('gemini-2.0-pro-exp-02-05', {
      useSearchGrounding: true,
    }),

    // Reasoning Model: Perplexity (Sonar-Reasoning)
    'chat-model-reasoning': perplexity('sonar-reasoning'),

    // Additional Models: OpenAI GPT-4o & GPT-4o-mini
    'openai-4o': openai('gpt-4o'),
    'openai-4o-mini': openai('gpt-4o-mini'),
  },

  // If you have image models, you can configure them here
  imageModels: {},
});

// 3. Chat Model Metadata Interface
interface ChatModel {
  id: string;
  name: string;
  description: string;
}

// 4. List of Chat Models for display or selection
export const chatModels: ChatModel[] = [
  {
    id: 'chat-model-small',
    name: 'Gemini 2.0 Flash (Small)',
    description: 'Lightweight tasks, uses Google search grounding',
  },
  {
    id: 'chat-model-large',
    name: 'Gemini 2.0 Pro Exp 02-05 (Large)',
    description: 'High-capacity tasks, uses Google search grounding',
  },
  {
    id: 'chat-model-reasoning',
    name: 'Perplexity Sonar (Reasoning)',
    description: 'Real-time web search with citations via Perplexity',
  },
  {
    id: 'openai-4o',
    name: 'OpenAI GPT-4o',
    description: 'OpenAI 4o model',
  },
  {
    id: 'openai-4o-mini',
    name: 'OpenAI GPT-4o (Mini)',
    description: 'OpenAI 4o-mini model',
  },
];
