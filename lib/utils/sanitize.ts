// lib/utils/sanitize.ts

import { CustomMessage } from '../types';
import { isCustomMessage, toCustomMessage } from '../message-helpers';

/**
 * Sanitizes UI messages to ensure they are properly formatted and have valid data
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

/**
 * Ensures that every message in the array is a valid CustomMessage
 */
export function ensureAllCustomMessages(messages: any[], chatId: string): CustomMessage[] {
  return messages.map(msg => {
    // Already a CustomMessage
    if (isCustomMessage(msg)) return msg;
    
    // Has minimal required fields
    if (msg && typeof msg === 'object' && msg.id && msg.role) {
      return toCustomMessage(msg, chatId);
    }
    
    // Invalid message, create minimal valid one
    console.warn('Invalid message found, creating minimal replacement:', msg);
    return {
      id: typeof msg?.id === 'string' ? msg.id : Math.random().toString(36).substring(2, 9),
      role: msg?.role || 'assistant',
      content: typeof msg?.content === 'string' ? msg.content : String(msg || ''),
      createdAt: new Date(),
      chatId
    };
  });
}
