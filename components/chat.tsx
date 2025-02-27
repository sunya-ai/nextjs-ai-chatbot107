'use client';

import type { Attachment, Message, CreateMessage } from 'ai';
import { useChat } from 'ai/react';
import { useState, useEffect } from 'react';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { toast } from 'sonner';
import { CustomMessage } from '@/lib/types'; // Import CustomMessage

export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
}: {
  id: string;
  initialMessages: Array<CustomMessage>; // Updated to CustomMessage instead of Message
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const {
    messages,
    input,
    setInput, // Add setInput to destructuring
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    reload,
    append,
    setMessages,
  } = useChat({
    id,
    body: { id, selectedChatModel: selectedChatModel },
    initialMessages: initialMessages.map(msg => toMessage(msg)), // Convert CustomMessage to Message for useChat
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onFinish: (message) => {
      // Convert Message to CustomMessage, then back to Message for append, handling reasoning
      const customMessage = toCustomMessage(message, id);
      append(toMessage(customMessage)); // Convert to Message with reasoning as string
    },
    onError: (error) => {
      toast.error('An error occurred, please try again!');
    },
  });

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  // Helper function to convert CustomMessage to Message
  function toMessage(msg: CustomMessage): Message {
    let reasoningValue: string | undefined = undefined;
    if (msg.reasoning) {
      if (Array.isArray(msg.reasoning) && msg.reasoning.length > 0) {
        reasoningValue = msg.reasoning[0]; // Use the first reasoning step as a string
      } else if (typeof msg.reasoning === 'string') {
        reasoningValue = msg.reasoning;
      }
    }
    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
      reasoning: reasoningValue,
    };
  }

  // Helper function to convert Message to CustomMessage
  function toCustomMessage(msg: Message, chatId: string): CustomMessage {
    return {
      ...msg,
      chatId, // Add chatId to match CustomMessage
      sources: (msg as Partial<CustomMessage>).sources || undefined,
      metadata: (msg as Partial<CustomMessage>).metadata || undefined,
      reasoning: msg.reasoning ? (typeof msg.reasoning === 'string' ? [msg.reasoning] : [msg.reasoning]) : undefined, // Convert string to string[]
    };
  }

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-gray-100 dark:bg-gray-900">
      <ChatHeader
        chatId={id}
        selectedModelId={selectedChatModel}
        selectedVisibilityType={selectedVisibilityType}
        isReadonly={isReadonly}
        className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm px-6 py-4"
      />

      <Messages
        chatId={id}
        isLoading={isLoading}
        votes={undefined} // Pass actual votes if available, or update logic to fetch votes
        messages={messages.map(m => toCustomMessage(m, id))} // Convert Messages to CustomMessages
        setMessages={(messagesOrUpdater) => {
          if (typeof messagesOrUpdater === 'function') {
            setMessages(prev => {
              const prevAsMessages = (prev as Message[]).map(m => toMessage(m)); // Convert CustomMessage to Message for useChat
              const updatedMessages = messagesOrUpdater(prevAsMessages);
              return updatedMessages.map(m => toCustomMessage(m, id)); // Convert back to CustomMessage
            });
          } else {
            setMessages(messagesOrUpdater.map(m => toCustomMessage(m, id))); // Convert array to CustomMessage
          }
        }}
        reload={reload}
        isReadonly={isReadonly}
        isArtifactVisible={isArtifactVisible}
        className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-md mx-4 my-4 p-4 overflow-y-auto"
      />

      <form className="flex mx-auto px-4 pb-4 md:pb-6 gap-2 w-full md:max-w-3xl bg-gray-100 dark:bg-gray-900">
        {!isReadonly && (
          <MultimodalInput
            chatId={id}
            input={input}
            setInput={setInput} // Now correctly passed
            handleSubmit={handleSubmit}
            isLoading={isLoading}
            stop={stop}
            attachments={attachments}
            setAttachments={setAttachments}
            messages={messages.map(m => toCustomMessage(m, id))} // Convert Messages to CustomMessages
            setMessages={(messagesOrUpdater) => {
              if (typeof messagesOrUpdater === 'function') {
                setMessages(prev => {
                  const prevAsMessages = (prev as Message[]).map(m => toMessage(m)); // Convert CustomMessage to Message for useChat
                  const updatedMessages = messagesOrUpdater(prevAsMessages);
                  return updatedMessages.map(m => toCustomMessage(m, id)); // Convert back to CustomMessage
                });
              } else {
                setMessages(messagesOrUpdater.map(m => toCustomMessage(m, id))); // Convert array to CustomMessage
              }
            }}
            append={append}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-sm p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          />
        )}
      </form>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput} // Also pass to Artifact if needed
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages.map(m => toCustomMessage(m, id))} // Convert Messages to CustomMessages
        setMessages={(messagesOrUpdater) => {
          if (typeof messagesOrUpdater === 'function') {
            setMessages(prev => {
              const prevAsMessages = (prev as Message[]).map(m => toMessage(m)); // Convert CustomMessage to Message for useChat
              const updatedMessages = messagesOrUpdater(prevAsMessages);
              return updatedMessages.map(m => toCustomMessage(m, id)); // Convert back to CustomMessage
            });
          } else {
            setMessages(messagesOrUpdater.map(m => toCustomMessage(m, id))); // Convert array to CustomMessage
          }
        }}
        reload={reload}
        isReadonly={isReadonly}
      />
    </div>
  );
}
