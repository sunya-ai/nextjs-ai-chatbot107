import { ContextEnhancer, EnhancerResponse } from './types';

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

export * from './assistants';
export * from './types';
