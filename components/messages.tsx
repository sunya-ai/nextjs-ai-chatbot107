import type { ChatRequestOptions, Message } from "ai";
import { PreviewMessage, ThinkingMessage } from "./message";
import { useScrollToBottom } from "./use-scroll-to-bottom";
import { Overview } from "./overview";
import { memo } from "react";
import type { Vote } from "@/lib/db/schema";
import equal from "fast-deep-equal";

interface MessagesProps {
  chatId: string;
  isLoading: boolean;
  votes: Array<Vote> | undefined;
  messages: Array<Message>;
  setMessages: (messages: Message[] | ((messages: Message[]) => Message[])) => void;
  reload: (chatRequestOptions?: ChatRequestOptions) => Promise<string | null | undefined>;
  isReadonly: boolean;
  isArtifactVisible: boolean;
}

function PureMessages({ chatId, isLoading, votes, messages, setMessages, reload, isReadonly }: MessagesProps) {
  // Remove the explicit type parameter <HTMLDivElement> from useScrollToBottom
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom();

  // Ensure messages is always an array with a safe fallback
  const safeMessages = Array.isArray(messages) ? messages : [];

  return (
    <div ref={messagesContainerRef} className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4">
      {safeMessages.length === 0 && <Overview />}

      {safeMessages.map((message, index) => (
        <PreviewMessage
          key={message.id}
          chatId={chatId}
          message={message}
          isLoading={isLoading && safeMessages.length - 1 === index}
          vote={votes ? votes.find((vote) => vote.messageId === message.id) : undefined}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
        />
      ))}

      {isLoading && safeMessages.length > 0 && safeMessages[safeMessages.length - 1].role === "user" && (
        <ThinkingMessage
          currentMessage={safeMessages[safeMessages.length - 1].content}
        />
      )}

      <div ref={messagesEndRef} className="shrink-0 min-w-[24px] min-h-[24px]" />
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  // Check if both props have isArtifactVisible set to true
  if (prevProps.isArtifactVisible && nextProps.isArtifactVisible) return true;

  // Safer length comparison with optional chaining
  if (prevProps.messages?.length !== nextProps.messages?.length) return false;

  try {
    // Use deep equality check for messages and votes, wrapped in try/catch for safety
    if (!equal(prevProps.messages, nextProps.messages)) return false;
    if (!equal(prevProps.votes, nextProps.votes)) return false;
  } catch (error) {
    console.error('Error comparing messages or votes:', error);
    return false;
  }

  // Additional checks for loading state
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.isLoading && nextProps.isLoading) return false;

  return true;
});
