import { PreviewMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Vote } from '@/lib/db/schema';
import { ChatRequestOptions, Message } from 'ai';
import { memo } from 'react';
import equal from 'fast-deep-equal';
import { UIArtifact } from './artifact';
import { CustomMessage } from '@/lib/types'; // Import CustomMessage
import { cn } from '@/lib/utils';

// Helper function to convert Message to CustomMessage (defined in chat.tsx, but included here for completeness)
const toCustomMessage = (msg: Message, chatId: string): CustomMessage => {
  return {
    ...msg,
    chatId, // Add chatId to match CustomMessage
    sources: (msg as Partial<CustomMessage>).sources || undefined,
    metadata: (msg as Partial<CustomMessage>).metadata || undefined,
    reasoning: msg.reasoning ? (typeof msg.reasoning === 'string' ? [msg.reasoning] : msg.reasoning as string[]) : undefined, // Convert string to string[] | keep string[]
  } as CustomMessage; // Explicitly assert as CustomMessage
};

interface ArtifactMessagesProps {
  chatId: string;
  isLoading: boolean;
  votes: Array<Vote> | undefined;
  messages: Array<CustomMessage>; // Updated to strictly CustomMessage[] (remove Message support)
  setMessages: (
    messagesOrUpdater: CustomMessage[] | ((messages: CustomMessage[]) => CustomMessage[])
  ) => void; // Updated to strictly CustomMessage[]
  reload: (
    chatRequestOptions?: ChatRequestOptions
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
  artifactStatus: UIArtifact['status'];
  progress: string;
}

function PureArtifactMessages({
  chatId,
  isLoading,
  votes,
  messages,
  setMessages,
  reload,
  isReadonly,
  progress,
}: ArtifactMessagesProps) {
  // Remove the explicit type parameter <HTMLDivElement> from useScrollToBottom
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom();

  // Ensure messages is always an array with a safe fallback (already CustomMessage[])
  const safeMessages = messages || [];

  // Type guard (already defined, but included for completeness and consistency)
  const isCustomMessage = (msg: Message | CustomMessage): msg is CustomMessage => {
    return 'chatId' in msg && 'reasoning' in msg && Array.isArray(msg.reasoning);
  };

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col gap-4 h-full items-center overflow-y-scroll px-4 pt-20"
    >
      {safeMessages.map((message, index) => (
        <PreviewMessage
          chatId={chatId}
          key={message.id}
          message={message} // Already CustomMessage, no conversion needed
          isLoading={isLoading && safeMessages.length - 1 === index}
          vote={
            votes
              ? votes.find((vote) => vote.messageId === message.id)
              : undefined
          }
          setMessages={setMessages} // Now strictly CustomMessage[]
          reload={reload}
          isReadonly={isReadonly}
        />
      ))}

      {/* Optionally display progress if needed */}
      {progress && (
        <div className="text-sm text-muted-foreground p-2 bg-background dark:bg-muted">
          {progress}
        </div>
      )}

      <div
        ref={messagesEndRef}
        className="shrink-0 min-w-[24px] min-h-[24px]"
      />
    </div>
  );
}

function areEqual(
  prevProps: ArtifactMessagesProps,
  nextProps: ArtifactMessagesProps,
) {
  // Check if both props have artifactStatus as 'streaming'
  if (
    prevProps.artifactStatus === 'streaming' &&
    nextProps.artifactStatus === 'streaming'
  )
    return true;

  // Safer length comparison with optional chaining
  if (prevProps.messages?.length !== nextProps.messages?.length) return false;

  try {
    // Use deep equality check for votes, wrapped in try/catch for safety
    if (!equal(prevProps.votes, nextProps.votes)) return false;
  } catch (error) {
    console.error('Error comparing votes:', error);
    return false;
  }

  // Additional checks for loading state and progress
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.isLoading && nextProps.isLoading) return false;
  if (prevProps.progress !== nextProps.progress) return false; // Add progress comparison

  return true;
}

export const ArtifactMessages = memo(PureArtifactMessages, areEqual);
