// lib/types.ts
import { Message as BaseMessage } from 'ai';

export type CustomMessage = BaseMessage & {
  sources?: { title: string; url: string }[]; // Optional sources for RAG or references
  metadata?: any | null; // Optional metadata for artifacts, matching your ExtendedMessage
  // Add other custom fields as needed (e.g., reasoning, toolInvocations)
};
