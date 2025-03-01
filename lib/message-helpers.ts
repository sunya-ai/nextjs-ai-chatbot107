import { Message as VercelMessage } from 'ai';
import { CustomMessage, DBMessage } from './types';

/**
 * Type guard to check if a message is a CustomMessage
 */
export function isCustomMessage(msg: VercelMessage | CustomMessage): msg is CustomMessage {
  return 'chatId' in msg;
}

/**
 * Type guard to check if a value is a string array
 */
export function isStringArray(value: any): value is string[] {
  return Array.isArray(value) && (value.length === 0 || typeof value[0] === 'string');
}

/**
 * Converts a Vercel SDK Message to our CustomMessage format
 */
export function toCustomMessage(msg: VercelMessage, chatId: string): CustomMessage {
  return {
    ...msg,
    chatId,
    sources: (msg as Partial<CustomMessage>).sources || undefined,
    metadata: (msg as Partial<CustomMessage>).metadata || undefined,
    // reasoning is already included in msg by spreading
  };
}

/**
 * Converts our CustomMessage back to a standard Vercel SDK Message
 */
export function toMessage(msg: CustomMessage): VercelMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
    reasoning: msg.reasoning
  };
}

/**
 * Standardizes reasoning format
 */
export function normalizeReasoning(reasoning: string | string[] | undefined): string | undefined {
  if (!reasoning) return undefined;
  if (Array.isArray(reasoning)) {
    return reasoning.length > 0 ? reasoning[0] : undefined;
  }
  return reasoning;
}

/**
 * Converts a DB format message (with reasoning as string[]) to CustomMessage
 */
export function fromDBMessage(dbMsg: any): CustomMessage {
  // Normalize reasoning to string format expected by Vercel AI SDK
  let reasoning: string | undefined;
  
  if (Array.isArray(dbMsg.reasoning)) {
    reasoning = dbMsg.reasoning.length > 0 ? dbMsg.reasoning[0] : undefined;
  } else if (typeof dbMsg.reasoning === 'string') {
    reasoning = dbMsg.reasoning;
  } else {
    reasoning = undefined;
  }
  
  return {
    id: dbMsg.id,
    role: dbMsg.role,
    content: dbMsg.content,
    createdAt: dbMsg.createdAt instanceof Date ? dbMsg.createdAt : new Date(dbMsg.createdAt),
    chatId: dbMsg.chatId,
    reasoning,
    sources: dbMsg.sources,
    metadata: dbMsg.metadata,
    toolInvocations: dbMsg.toolInvocations
  };
}

/**
 * Converts a CustomMessage to DB format (with reasoning as string[])
 */
export function toDBMessage(msg: CustomMessage): DBMessage {
  // Convert reasoning to array format for DB storage
  const reasoning = msg.reasoning ? [msg.reasoning] : [];
  
  return {
    ...msg,
    reasoning
  } as DBMessage;
}

/**
 * Safely handles unknown message formats, ensuring conversion to CustomMessage
 */
export function ensureCustomMessage(msg: any, chatId: string): CustomMessage {
  if (isCustomMessage(msg)) {
    return msg;
  }
  
  if (typeof msg === 'object' && msg !== null) {
    if ('reasoning' in msg && Array.isArray(msg.reasoning)) {
      return fromDBMessage(msg);
    }
    
    return toCustomMessage(msg as VercelMessage, chatId);
  }
  
  // If all else fails, create a minimal valid message
  return {
    id: typeof msg?.id === 'string' ? msg.id : Math.random().toString(36).substring(2, 9),
    role: typeof msg?.role === 'string' ? msg.role : 'assistant',
    content: typeof msg?.content === 'string' ? msg.content : String(msg || ''),
    createdAt: new Date(),
    chatId
  };
}

/**
 * Convert an array of messages
 */
export function convertMessagesArray(
  messages: VercelMessage[] | CustomMessage[],
  chatId: string
): CustomMessage[] {
  return messages.map(msg => isCustomMessage(msg) ? msg : toCustomMessage(msg, chatId));
}

/**
 * Sanitizes messages for UI display
 */
export function sanitizeUIMessages(messages: Array<any>): Array<CustomMessage> {
  const sanitizedMessages = messages.map(message => {
    // If not a valid message object, return as is
    if (!message || typeof message !== 'object') return message;
    
    // Ensure message has expected format
    if (!message.id || !message.role) {
      console.warn('Invalid message format:', message);
      return message;
    }
    
    // Convert any array reasoning to string (first item only)
    let reasoning = message.reasoning;
    if (Array.isArray(reasoning)) {
      reasoning = reasoning.length > 0 ? reasoning[0] : undefined;
    }
    
    // Fix content if needed
    let content = message.content;
    if (!content && Array.isArray(message.content)) {
      content = message.content
        .filter(item => item && (typeof item === 'string' || item.text || item.reasoning))
        .map(item => {
          if (typeof item === 'string') return item;
          if (item.text) return item.text;
          if (item.reasoning) return `Reasoning: ${item.reasoning}`;
          return '';
        })
        .join(' ');
    }
    
    // Sanitize tool invocations
    let toolInvocations = message.toolInvocations;
    if (toolInvocations) {
      const toolResultIds: string[] = [];
      
      // First collect IDs of all results
      toolInvocations.forEach(tool => {
        if (tool.state === 'result' && tool.toolCallId) {
          toolResultIds.push(tool.toolCallId);
        }
      });
      
      // Then filter to keep only valid calls/results
      toolInvocations = toolInvocations.filter(tool => 
        tool.state === 'result' || 
        (tool.state === 'call' && tool.toolCallId && toolResultIds.includes(tool.toolCallId))
      );
    }
    
    // Return a sanitized message
    return {
      id: message.id,
      role: message.role,
      content: content || '',
      createdAt: message.createdAt || new Date(),
      chatId: message.chatId || '',
      reasoning,
      sources: Array.isArray(message.sources) ? message.sources : [],
      metadata: message.metadata || null,
      toolInvocations
    };
  });
  
  // Filter out invalid messages
  return sanitizedMessages.filter(message => 
    message && typeof message === 'object' && message.id && message.role
  ) as CustomMessage[];
}
