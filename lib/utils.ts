// lib/utils.ts
import type {
  CoreAssistantMessage,
  CoreToolMessage,
  Message,
  TextStreamPart,
  ToolInvocation,
  ToolSet,
} from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Import your custom types for consistency
import type { DBMessage, Document } from '@/lib/db/schema';
import { CustomMessage } from '@/lib/types'; // Ensure this import matches your lib/types.ts

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ApplicationError extends Error {
  info: string;
  status: number;
}

export const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const error = new Error(
      'An error occurred while fetching the data.',
    ) as ApplicationError;

    error.info = await res.json();
    error.status = res.status;

    throw error;
  }

  return res.json();
};

export function getLocalStorage(key: string) {
  if (typeof window !== 'undefined') {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return [];
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function addToolMessageToChat({
  toolMessage,
  messages,
}: {
  toolMessage: CoreToolMessage;
  messages: Array<CustomMessage>;
}): Array<CustomMessage> {
  return messages.map((message) => {
    if (message.toolInvocations) {
      return {
        ...message,
        toolInvocations: message.toolInvocations.map((toolInvocation) => {
          const toolResult = toolMessage.content.find(
            (tool) => tool.toolCallId === toolInvocation.toolCallId,
          );

          if (toolResult) {
            return {
              ...toolInvocation,
              state: 'result',
              result: toolResult.result,
            };
          }

          return toolInvocation;
        }),
      };
    }

    return message;
  });
}

export function convertToUIMessages(
  messages: Array<DBMessage>,
): Array<CustomMessage> {
  return messages.reduce((chatMessages: Array<CustomMessage>, message) => {
    if (message.role === 'tool') {
      return addToolMessageToChat({
        toolMessage: message as CoreToolMessage,
        messages: chatMessages,
      });
    }

    let textContent = '';
    const toolInvocations: Array<ToolInvocation> = [];
    const sources: { title: string; url: string }[] = message.sources ?? [];
    const metadata: any | null = message.metadata ?? null;
    let reasoning: string[] = [];

    if (typeof message.content === 'string') {
      textContent = message.content;
    } else if (Array.isArray(message.content)) {
      for (const content of message.content) {
        if (content.type === 'text') {
          textContent += content.text;
        } else if (content.type === 'tool-call') {
          toolInvocations.push({
            state: 'call',
            toolCallId: content.toolCallId,
            toolName: content.toolName,
            args: content.args,
          });
        } else if (content.type === 'reasoning') {
          // Handle reasoning as an array, defaulting to [] if undefined
          reasoning = content.reasoning ? [content.reasoning] : [];
        }
      }
    }

    chatMessages.push({
      id: message.id,
      role: message.role as CustomMessage['role'],
      content: textContent,
      chatId: message.chatId, // Include chatId from DBMessage
      reasoning: message.reasoning ?? [], // Default to empty array if undefined
      toolInvocations,
      sources, // Include sources from DBMessage
      metadata, // Include metadata from DBMessage
    });

    return chatMessages;
  }, []);
}

/**
 * Converts CustomMessage array to Message array for UI rendering compatibility
 * Handles the conversion of the reasoning property from string[] to string
 */
export function convertCustomToMessages(messages: Array<CustomMessage>): Array<Message> {
  return messages.map(message => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    // Convert reasoning array to string if it exists
    ...(message.reasoning && {
      reasoning: Array.isArray(message.reasoning) 
        ? message.reasoning.join('\n') 
        : message.reasoning
    }),
    // Include other properties as needed
    ...(message.metadata && { metadata: message.metadata }),
    ...(message.sources && { sources: message.sources }),
    ...(message.toolInvocations && { toolInvocations: message.toolInvocations })
  })) as Message[];
}

type ResponseMessageWithoutId = CoreToolMessage | CoreAssistantMessage;
type ResponseMessage = ResponseMessageWithoutId & { id: string };

export function sanitizeResponseMessages({
  messages,
  reasoning,
}: {
  messages: Array<ResponseMessage>;
  reasoning: string | string[] | undefined; // Updated to handle array or string
}) {
  const toolResultIds: Array<string> = [];

  for (const message of messages) {
    if (message.role === 'tool') {
      for (const content of message.content) {
        if (content.type === 'tool-result') {
          toolResultIds.push(content.toolCallId);
        }
      }
    }
  }

  const messagesBySanitizedContent = messages.map((message) => {
    if (message.role !== 'assistant') return message;

    if (typeof message.content === 'string') return message;

    const sanitizedContent = message.content.filter((content) =>
      content.type === 'tool-call'
        ? toolResultIds.includes(content.toolCallId)
        : content.type === 'text'
          ? content.text.length > 0
          : true,
    );

    if (reasoning) {
      const reasoningArray = Array.isArray(reasoning) ? reasoning : [reasoning];
      // @ts-expect-error: reasoning message parts in SDK are WIP
      sanitizedContent.push({ type: 'reasoning', reasoning: reasoningArray });
    }

    return {
      ...message,
      content: sanitizedContent,
    };
  });

  return messagesBySanitizedContent.filter(
    (message) => message.content.length > 0,
  );
}

export function sanitizeUIMessages(messages: Array<CustomMessage>): Array<CustomMessage> {
  const messagesBySanitizedToolInvocations = messages.map((message) => {
    if (message.role !== 'assistant') return message;

    if (!message.toolInvocations) return message;

    const toolResultIds: Array<string> = [];

    for (const toolInvocation of message.toolInvocations) {
      if (toolInvocation.state === 'result') {
        toolResultIds.push(toolInvocation.toolCallId);
      }
    }

    const sanitizedToolInvocations = message.toolInvocations.filter(
      (toolInvocation) =>
        toolInvocation.state === 'result' ||
        toolResultIds.includes(toolInvocation.toolCallId),
    );

    return {
      ...message,
      toolInvocations: sanitizedToolInvocations,
    };
  });

  return messagesBySanitizedToolInvocations.filter(
    (message) =>
      message.content.length > 0 ||
      (message.toolInvocations && message.toolInvocations.length > 0) ||
      (message.sources && message.sources.length > 0) || // Include sources in filtering
      message.metadata !== null || // Include metadata in filtering
      message.chatId !== undefined, // Include chatId in filtering
  );
}

export function getMostRecentUserMessage(messages: Array<CustomMessage>) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

export function getDocumentTimestampByIndex(
  documents: Array<Document>,
  index: number,
) {
  if (!documents) return new Date();
  if (index > documents.length) return new Date();

  return documents[index].createdAt;
}
