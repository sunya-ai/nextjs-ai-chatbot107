// Define your models here.

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
    id: 'deepseek-chat',
    label: 'SUNYA AI DS',
    apiIdentifier: 'deepseek-chat',
    description: 'Latest version of DeepSeek chat model',
  },
  {
    id: 'deepseek-reasoner',
    label: 'SUNYA AI R1',
    apiIdentifier: 'deepseek-reasoner',
    description: 'Specialized model for complex reasoning tasks',
  },
] as const;

export const DEFAULT_MODEL_NAME: string = 'gpt-4o-mini';
