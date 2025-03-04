import { PreviewMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Vote } from '@/lib/db/schema';
import { ChatRequestOptions } from 'ai';
import { memo } from 'react';
import equal from 'fast-deep-equal';
import { UIArtifact } from './artifact';
import { CustomMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ArtifactMessagesProps {
  chatId: string;
  isLoading: boolean;
  votes: Array<Vote> | undefined;
  messages: Array<CustomMessage>;
  setMessages: (
    messagesOrUpdater: CustomMessage[] | ((messages: CustomMessage[]) => CustomMessage[])
  ) => void;
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
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom();

  // Ensure messages is always an array with a safe fallback
  const safeMessages = messages || [];

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col gap-4 h-full items-center overflow-y-scroll px-4 pt-20"
    >
      {safeMessages.map((message, index) => (
        <PreviewMessage
          chatId={chatId}
          key={message.id}
          message={message}
          isLoading={isLoading && safeMessages.length - 1 === index}
          vote={
            votes
              ? votes.find((vote) => vote.messageId === message.id)
              : undefined
          }
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
        />
      ))}

      {/* Display progress if provided */}
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
  if (prevProps.progress !== nextProps.progress) return false;

  return true;
}

export const ArtifactMessages = memo(PureArtifactMessages, areEqual);
