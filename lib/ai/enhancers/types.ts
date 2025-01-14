export type EnhancerResponse = {
  enhancedContext: string;
  metadata?: Record<string, any>;
}

export type ContextEnhancer = {
  enhance: (message: string) => Promise<EnhancerResponse>;
  name: string;
}
