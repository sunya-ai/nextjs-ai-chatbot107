// Define your models here.
export interface Model {
  id: string;
  label: string;
  apiIdentifier: string;
  description: string;
}

export const models: Array<Model> = [
  {
    id: 'gpt-4o-mini',
    label: 'SUNYA AI',
    apiIdentifier: 'gpt-4o-mini',
    description: 'Small model for fast, lightweight tasks',
  },
  {
    id: 'gpt-4o',
    label: 'SUNYA AI Advanced',
    apiIdentifier: 'gpt-4o',
    description: 'For complex, multi-step tasks',
  },
  {
    id: 'sonar',
    label: 'Perplexity Sonar',
    apiIdentifier: 'sonar',
    description: 'Real-time web search with citations',
  },
  {
    id: 'sonar-pro',
    label: 'Perplexity Pro',
    apiIdentifier: 'sonar-pro', 
    description: 'Enhanced web search with 2x more citations',
  }
] as const;

export const DEFAULT_MODEL_NAME: string = 'gpt-4o-mini';
