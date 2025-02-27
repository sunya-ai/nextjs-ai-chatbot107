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
import { CustomMessage } from '@/lib/types'; // Import CustomMessage with reasoning: string[] | undefined

// Type guard to check if a message is a CustomMessage
function isCustomMessage(msg: Message | CustomMessage): msg is CustomMessage {
  return 'chatId' in msg;
}

export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
}: {
  id: string;
  initialMessages: Array<CustomMessage>; // Updated to CustomMessage with reasoning: string[] | undefined
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
    setMessages: setChatMessages,
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

  // Initialize votes as Vote[] | undefined to match Artifact's prop type
  const [votes, setVotes] = useState<Vote[] | undefined>(undefined); // Allow undefined

  useEffect(() => {
    setIsMounted(true);
    // Fetch votes for this chatId if needed (e.g., from a database or API)
    // Example: fetchVotes(id).then(setVotes);
    const fetchVotes = async () => {
      try {
        // Placeholder for actual database query using @vercel/postgres or drizzle-orm
        // Replace with your actual DB query logic
        const response = await fetch(`/api/votes?chatId=${id}`);
        if (response.ok) {
          const votesData = await response.json() as Vote[];
          setVotes(votesData);
        } else {
          setVotes([]); // Fallback to empty array if no votes are found
        }
      } catch (error) {
        console.error('Failed to fetch votes:', error);
        setVotes([]); // Fallback to empty array on error
      }
    };
    fetchVotes();
  }, [id]);

  if (!isMounted) return null;

  // Helper function to convert CustomMessage or Message to Message
  function toMessage(msg: CustomMessage | Message): Message {
    let reasoningValue: string | undefined = undefined;
    if (msg.reasoning) {
      if (Array.isArray(msg.reasoning) && msg.reasoning.length > 0) {
        reasoningValue = msg.reasoning[0]; // Use the first reasoning step as a string (matches SDK)
      } else if (typeof msg.reasoning === 'string') {
        reasoningValue = msg.reasoning;
      }
    }
    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
      reasoning: reasoningValue as string | undefined, // Explicitly assert type to match Message
    };
  }

  // Helper function to convert Message to CustomMessage
  function toCustomMessage(msg: Message, chatId: string): CustomMessage {
    return {
      ...msg,
      chatId, // Add chatId to match CustomMessage
      sources: (msg as Partial<CustomMessage>).sources || undefined,
      metadata: (msg as Partial<CustomMessage>).metadata || undefined,
      reasoning: msg.reasoning ? (typeof msg.reasoning === 'string' ? [msg.reasoning] : msg.reasoning as string[]) : undefined, // Convert string to string[] | keep string[]
    } as CustomMessage; // Explicitly assert as CustomMessage
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
        votes={votes} // Pass votes to Messages if needed (optional, based on Messages component)
        messages={messages.map(m => toCustomMessage(m, id))} // Convert Messages to CustomMessages for display
        setMessages={(messagesOrUpdater) => {
          if (typeof messagesOrUpdater === 'function') {
            setChatMessages(prev => {
              const prevAsMessages = prev; // Already Message[]
              // Convert Message[] to CustomMessage[] before passing to messagesOrUpdater
              const prevAsCustomMessages = prev.map(m => toCustomMessage(m, id));
              const updatedMessages = messagesOrUpdater(prevAsCustomMessages);
              // Convert back to Message[] for setChatMessages
              return updatedMessages.map(m => toMessage(m));
            });
          } else {
            // Convert Message[] to CustomMessage[] before setting, then back to Message[]
            const customMessages = messagesOrUpdater.map(m => toCustomMessage(m, id)) as CustomMessage[];
            setChatMessages(customMessages.map(m => toMessage(m)));
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
            messages={messages.map(m => toMessage(m))} // Convert Messages to Message[] for MultimodalInput
            setMessages={(messagesOrUpdater) => {
              if (typeof messagesOrUpdater === 'function') {
                setChatMessages(prev => {
                  const prevAsMessages = prev; // Already Message[]
                  const updatedMessages = messagesOrUpdater(prevAsMessages);
                  return updatedMessages.map(m => {
                    if (isCustomMessage(m)) {
                      return toMessage(m); // Convert CustomMessage to Message
                    }
                    return m; // Already a Message, return as-is
                  });
                });
              } else {
                setChatMessages(messagesOrUpdater.map(m => {
                  if (isCustomMessage(m)) {
                    return toMessage(m); // Convert CustomMessage to Message
                  }
                  return m; // Already a Message, return as-is
                }));
              }
            }}
            append={append} // Use append directly, as it expects Message | CreateMessage
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
        append={(message, options) => append(toMessage(message as CustomMessage), options)} // Convert CustomMessage to Message before appending
        messages={messages.map(m => toCustomMessage(m, id))} // Convert Messages to CustomMessages for Artifact
        setMessages={(messagesOrUpdater) => {
          if (typeof messagesOrUpdater === 'function') {
            setChatMessages(prev => {
              const prevAsMessages = prev; // Already Message[]
              // Convert Message[] to CustomMessage[] before passing to messagesOrUpdater
              const prevAsCustomMessages = prev.map(m => toCustomMessage(m, id));
              const updatedMessages = messagesOrUpdater(prevAsCustomMessages) as CustomMessage[];
              // Convert back to Message[] for setChatMessages, handling reasoning correctly
              return updatedMessages.map(m => toMessage(m));
            });
          } else {
            // Convert Message[] to CustomMessage[] before setting, then back to Message[]
            const customMessages = messagesOrUpdater.map(m => toCustomMessage(m, id)) as CustomMessage[];
            setChatMessages(customMessages.map(m => toMessage(m)));
          }
        }}
        reload={reload}
        votes={votes} // Pass votes as Vote[] | undefined to match Artifact's prop type
        // Removed dataStream as it's not available in useChat@4.1.46
        isReadonly={isReadonly}
      />
    </div>
  );
}
