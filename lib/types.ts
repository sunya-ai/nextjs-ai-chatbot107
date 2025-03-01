import { Message as BaseMessage } from 'ai';

// Export BaseMessage as Message for external use (type-only export)
export type { BaseMessage as Message };

// Define CustomMessage with required chatId to match database schema
export interface CustomMessage extends BaseMessage {
  chatId: string; // Required for database alignment
  sources?: { title: string; url: string }[]; // Optional sources from AI SDK
  metadata?: any | null; // Optional metadata for artifacts or other data
  reasoning?: string | undefined; // Match BaseMessage's reasoning type (string or undefined)
}

// Define ArtifactKind for document kinds
import { ArtifactKind } from '@/components/artifact';

export interface UIArtifact {
  title: string;
  documentId: string;
  kind: ArtifactKind; // Use ArtifactKind for type safety
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
