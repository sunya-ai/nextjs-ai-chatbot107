'use client';

import { ChatRequestOptions, Message } from 'ai';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Overview } from './overview';
import { memo } from 'react';
import { Vote } from '@/lib/db/schema';
import equal from 'fast-deep-equal';
import { cn } from '@/lib/utils';

// Extend Message type with metadata
interface UIMessage extends Message {
  metadata?: string | null;
}

interface MessagesProps {
  chatId: string;
  isLoading: boolean;
  votes?: Array<Vote>; // Explicitly optional to avoid TypeScript errors
  messages: Array<UIMessage>;
  setMessages: (
    messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
  isArtifactVisible: boolean;
  className?: string;
}

function PureMessages({
  chatId,
  isLoading,
  votes,
  messages,
  setMessages,
  reload,
  isReadonly,
  isArtifactVisible,
  className,
}: MessagesProps) {
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom(); // Remove <HTMLDivElement>

  return (
    <div
      ref={messagesContainerRef}
      className={cn(
        "flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4",
        className
      )}
    >
      {messages.length === 0 && <Overview />}

      {messages.map((message, index) => (
        <PreviewMessage
          key={message.id}
          chatId={chatId}
          message={message}
          isLoading={isLoading && messages.length - 1 === index}
          vote={votes?.find((vote) => vote.messageId === message.id)} // Safely handle undefined votes
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
        />
      ))}

      {isLoading &&
        messages.length > 0 &&
        messages[messages.length - 1].role === 'user' && <ThinkingMessage />}

      <div
        ref={messagesEndRef}
        className="shrink-0 min-w-[24px] min-h-[24px]"
      />
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  // Remove votes from memo comparison since it’s optional and might be undefined
  if (prevProps.isArtifactVisible !== nextProps.isArtifactVisible) return false;
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;
  return true; // Only compare essential props, ignoring votes
});
