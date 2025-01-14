import OpenAI from 'openai';
import { ContextEnhancer, EnhancerResponse } from './types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const createAssistantsEnhancer = (assistantId: string): ContextEnhancer => {
  return {
    name: 'openai-assistant',
    enhance: async (message: string): Promise<EnhancerResponse> => {
      try {
        console.log('🚀 Starting enhancement with Assistant:', assistantId);
        console.log('📝 User message:', message);

        const thread = await openai.beta.threads.create();
        console.log('🧵 Created thread:', thread.id);
        
        const threadMessage = await openai.beta.threads.messages.create(thread.id, {
          role: 'user',
          content: message
        });
        console.log('💬 Added message to thread:', threadMessage.id);

        const run = await openai.beta.threads.runs.create(thread.id, {
          assistant_id: assistantId
        });
        console.log('▶️ Started run:', run.id);

        let completedRun = await openai.beta.threads.runs.retrieve(
          thread.id,
          run.id
        );

        while (completedRun.status === 'in_progress' || completedRun.status === 'queued') {
          console.log('⏳ Run status:', completedRun.status);
          await new Promise(resolve => setTimeout(resolve, 1000));
          completedRun = await openai.beta.threads.runs.retrieve(
            thread.id,
            run.id
          );
        }

        console.log('✅ Run completed with status:', completedRun.status);

        const messages = await openai.beta.threads.messages.list(thread.id);
        console.log('📨 Retrieved messages');

        const assistantResponse = messages.data[0].content[0];
        
        if ('text' in assistantResponse) {
          console.log('💡 Assistant response received:', assistantResponse.text.value.substring(0, 100) + '...');
          return {
            enhancedContext: assistantResponse.text.value,
            metadata: {
              threadId: thread.id,
              runId: run.id,
              assistantId
            }
          };
        }
        
        throw new Error('Unexpected response format');
      } catch (error) {
        console.error('❌ Assistant enhancer error:', error);
        return {
          enhancedContext: '',
          metadata: { error: 'Failed to enhance with assistant', details: error }
        };
      }
    }
  };
};
