// lib/types.ts
import { Message as BaseMessage } from 'ai';

export type CustomMessage = BaseMessage & {
  chatId?: string; // Added for database alignment
  sources?: { title: string; url: string }[];
  metadata?: any | null;
  reasoning?: string[] | null;
};
