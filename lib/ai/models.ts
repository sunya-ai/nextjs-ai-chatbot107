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
    id: 'sonar-reasoning',
    label: 'SUNYA Reasoning',
    apiIdentifier: 'sonar-reasoning',
    description: 'Experimental model: step-by-step reasoning tasks'
  },
  {
    id: 'gemini-2.0-pro-exp-02-05',
    label: 'SUNYA Search',
    apiIdentifier: 'gemini-2.0-pro-exp-02-05',
    description: 'Enhanced model with real-time search capabilities'
  },
  {
    id: 'gemini-2.0-flash',
    label: 'SUNYA Flash',
    apiIdentifier: 'gemini-2.0-flash',
    description: 'Fast, efficient model for quick responses'
  }
] as const;

export const DEFAULT_MODEL_NAME: string = 'gpt-4o-mini';
