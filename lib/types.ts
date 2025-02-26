// lib/types.ts
import { Message as BaseMessage } from 'ai';

// Define CustomMessage with required chatId to match database schema
export interface CustomMessage extends BaseMessage {
  chatId: string; // Required for database alignment
  sources?: { title: string; url: string }[]; // Optional sources from AI SDK
  metadata?: any | null; // Optional metadata for artifacts or other data
  reasoning?: string[]; // Optional reasoning, defaults to [] in practice (never null)
}

// Optional: Define UIArtifact here for consistency, if used with messages
export interface UIArtifact {
  title: string;
  documentId: string;
  kind: string; // Use string or reference ArtifactKind from components/artifact.tsx
  content: string;
  isVisible: boolean;
  status: 'streaming' | 'idle';
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}
