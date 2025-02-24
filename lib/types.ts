// lib/types.ts
import { Message as BaseMessage } from 'ai';

export interface ExtendedMessage extends BaseMessage {
  metadata?: any | null; // Adjust type as needed (e.g., string, object)
}
