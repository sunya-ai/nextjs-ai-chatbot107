import { Message as BaseMessage } from 'ai';

export type { BaseMessage as Message };

export interface CustomMessage extends BaseMessage {
  chatId: string;
  sources?: { title: string; url: string }[];
  metadata?: any | null;
  reasoning?: string | undefined;
}

import { ArtifactKind } from '@/components/artifact';

export interface UIArtifact {
  title: string;
  documentId: string;
  kind: ArtifactKind;
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
