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
import { CustomMessage } from '@/lib/types';

// Type guard to check if a message is a CustomMessage
function isCustomMessage(msg: Message | CustomMessage): msg is CustomMessage {
  return 'chatId' in msg;
}

// Convert CustomMessage or Message to Message
function toMessage(msg: CustomMessage | Message): Message {
  let reasoningValue: string | undefined = undefined;
  if (msg.reasoning) {
    if (Array.isArray(msg.reasoning)) {
      reasoningValue = msg.reasoning[0]; // Take first element if array
    } else if (typeof msg.reasoning === 'string') {
      reasoningValue = msg.reasoning; // Use string directly
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

// Convert Message to CustomMessage
function toCustomMessage(msg: Message, chatId: string): CustomMessage {
  return {
    ...msg,
    chatId,
    sources: (msg as Partial<CustomMessage>).sources || undefined,
    metadata: (msg as Partial<CustomMessage>).metadata || undefined,
    reasoning: msg.reasoning,
  };
}

export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
}: {
  id: string;
  initialMessages: Array<CustomMessage>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const {
    messages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    reload,
    append,
    setMessages: setChatMessages,
  } = useChat({
    id,
    body: { id, selectedChatModel: selectedChatModel },
    initialMessages: initialMessages.map(msg => toMessage(msg)),
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onFinish: (message) => {
      const customMessage = toCustomMessage(message, id);
      append(toMessage(customMessage));
    },
    onError: (error) => {
      toast.error('An error occurred, please try again!');
    },
  });

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);
  const [votes, setVotes] = useState<Vote[] | undefined>(undefined);

  useEffect(() => {
    setIsMounted(true);
    const fetchVotes = async () => {
      try {
        const response = await fetch(`/api/votes?chatId=${id}`);
        if (response.ok) {
          const votesData = await response.json() as Vote[];
          setVotes(votesData);
        } else {
          setVotes([]);
        }
      } catch (error) {
        console.error('Failed to fetch votes:', error);
        setVotes([]);
      }
    };
    fetchVotes();
  }, [id]);

  if (!isMounted) return null;

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
        votes={votes}
        messages={messages.map(m => toCustomMessage(m, id))}
        setMessages={(messagesOrUpdater) => {
          if (typeof messagesOrUpdater === 'function') {
            setChatMessages(prev => {
              const prevCustomMessages = prev.map(m => toCustomMessage(m, id));
              const updatedMessages = messagesOrUpdater(prevCustomMessages);
              return updatedMessages.map(m => toMessage(m));
            });
          } else {
            setChatMessages(messagesOrUpdater.map(m => toMessage(m)));
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
            setInput={setInput}
            handleSubmit={handleSubmit}
            isLoading={isLoading}
            stop={stop}
            attachments={attachments}
            setAttachments={setAttachments}
            messages={messages}
            setMessages={(messagesOrUpdater) => {
              if (typeof messagesOrUpdater === 'function') {
                setChatMessages(prev => messagesOrUpdater(prev));
              } else {
                setChatMessages(messagesOrUpdater.map(m => toMessage(m)));
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
        setInput={setInput}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={(message, options) => append(toMessage(message as CustomMessage), options)}
        messages={messages.map(m => toCustomMessage(m, id))}
        setMessages={(messagesOrUpdater) => {
          if (typeof messagesOrUpdater === 'function') {
            setChatMessages(prev => {
              const prevCustomMessages = prev.map(m => toCustomMessage(m, id));
              const updatedMessages = messagesOrUpdater(prevCustomMessages);
              return updatedMessages.map(m => toMessage(m));
            });
          } else {
            setChatMessages(messagesOrUpdater.map(m => toMessage(m)));
          }
        }}
        reload={reload}
        votes={votes}
        isReadonly={isReadonly}
      />
    </div>
  );
}
