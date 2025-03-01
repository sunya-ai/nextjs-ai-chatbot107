import { message } from './schema';
import { CustomMessage, DBMessage } from '../types';
import { fromDBMessage, toDBMessage } from '../message-helpers';

/**
 * Converts database schema messages to runtime CustomMessage format
 */
export function convertSchemaMessagesToCustomMessages(messages: any[]): CustomMessage[] {
  return messages.map(message => {
    // Extract reasoning from the DB which could be stored as an array
    let reasoning: string[] | string | undefined;
    
    try {
      // Safely parse reasoning from DB
      if (message.reasoning) {
        if (typeof message.reasoning === 'string') {
          try {
            // Check if it's a JSON string containing an array
            const parsed = JSON.parse(message.reasoning);
            reasoning = Array.isArray(parsed) ? parsed : [message.reasoning];
          } catch {
            reasoning = message.reasoning;
          }
        } else {
          reasoning = message.reasoning;
        }
      }
    } catch (error) {
      console.error('Error parsing reasoning:', error);
      reasoning = undefined;
    }
    
    // Create the DBMessage intermediary format
    const dbMessage: DBMessage = {
      id: message.id,
      role: message.role,
      content: typeof message.content === 'string' 
        ? message.content 
        : JSON.stringify(message.content),
      createdAt: message.createdAt instanceof Date ? message.createdAt : new Date(message.createdAt),
      chatId: message.chatId,
      reasoning,
      sources: message.sources || [],
      metadata: message.metadata || null,
      toolInvocations: message.toolInvocations
    };
    
    // Convert to CustomMessage
    return fromDBMessage(dbMessage);
  });
}

/**
 * Converts CustomMessage to database schema format for storage
 */
export function convertCustomMessageToSchemaMessage(message: CustomMessage): any {
  // First convert to DB format with reasoning as array
  const dbMessage = toDBMessage(message);
  
  return {
    id: message.id,
    chatId: message.chatId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    metadata: message.metadata || null,
    // Ensure reasoning is stored as a JSON array in the DB
    reasoning: dbMessage.reasoning,
    sources: message.sources || []
  };
}

/**
 * Transforms query results for saveMessages function
 */
export function prepareMessagesForDB(messages: CustomMessage[]): any[] {
  return messages.map(convertCustomMessageToSchemaMessage);
}

/**
 * Safe parsing of reasoning data from database
 */
export function parseReasoningFromDB(dbReasoning: any): string | undefined {
  try {
    if (!dbReasoning) return undefined;
    
    if (Array.isArray(dbReasoning)) {
      return dbReasoning.length > 0 ? String(dbReasoning[0]) : undefined;
    }
    
    if (typeof dbReasoning === 'object') {
      return JSON.stringify(dbReasoning);
    }
    
    return String(dbReasoning);
  } catch (e) {
    console.error('Error parsing reasoning data:', e);
    return undefined;
  }
}

/**
 * Prepare reasoning data for database storage
 */
export function prepareReasoningForDB(reasoning: string | undefined): string[] {
  if (!reasoning) return [];
  return [reasoning];
}
