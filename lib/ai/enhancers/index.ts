// lib/ai/enhancers/index.ts
import { ContextEnhancer, EnhancerResponse } from './types';
import * as AssistantsModule from './assistants';

export const combineEnhancers = (enhancers: ContextEnhancer[]) => {
  return {
    name: 'combined-enhancer',
    enhance: async (message: string): Promise<EnhancerResponse> => {
      const results = await Promise.all(
        enhancers.map(enhancer => enhancer.enhance(message))
      );
      
      return {
        enhancedContext: results
          .map(r => r.enhancedContext)
          .filter(Boolean)
          .join('\n\n'),
        metadata: results.reduce((acc, curr, idx) => ({
          ...acc,
          [enhancers[idx].name]: curr.metadata
        }), {})
      };
    }
  };
};

// Export the createAssistantsEnhancer function explicitly
export const { createAssistantsEnhancer } = AssistantsModule;

// Export all types from the types module
export * from './types';

// If you need to use the EnhancerResponse from assistants module elsewhere,
// export it with a different name
export type { EnhancerResponse as AssistantsEnhancerResponse } from './assistants';
