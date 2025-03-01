import { ChatRequestOptions, Message } from 'ai';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Overview } from './overview';
import { memo, useEffect, useMemo } from 'react';
import { Vote } from '@/lib/db/schema';
import equal from 'fast-deep-equal';
import { MDXRemote } from 'next-mdx-remote';
import { serialize } from 'next-mdx-remote/serialize';
import { useChat } from 'ai/react';
import { CustomMessage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChevronDownIcon } from './icons';

// Define custom MDX components for interactivity
const customComponents = {
  button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick} className="bg-blue-500 text-white px-2 py-1 rounded">
      {children}
    </button>
  ),
  form: ({ children, onSubmit }: { children: React.ReactNode; onSubmit?: (e: React.FormEvent) => void }) => (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      {children}
    </form>
  ),
  input: (props: React.InputHTMLAttributes<HTMLInputElement>) => 
    <input {...props} className="border p-1 rounded" />,
};

interface MessagesProps {
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
  isArtifactVisible: boolean;
  className?: string;
}

// Helper function to convert Message to CustomMessage
const toCustomMessage = (msg: Message, chatId: string): CustomMessage => {
  return {
    ...msg,
    chatId,
    sources: (msg as Partial<CustomMessage>).sources || undefined,
    metadata: (msg as Partial<CustomMessage>).metadata || undefined,
    reasoning: msg.reasoning,
  } as CustomMessage;
};

// Helper function to convert CustomMessage to Message
const toMessage = (msg: CustomMessage): Message => {
  let reasoningValue: string | undefined = undefined;
  
  if (msg.reasoning) {
    if (Array.isArray(msg.reasoning) && msg.reasoning.length > 0) {
      reasoningValue = msg.reasoning[0];
    } else if (typeof msg.reasoning === 'string') {
      reasoningValue = msg.reasoning;
    }
  }
  
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
    reasoning: reasoningValue
  };
};

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
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  const { append } = useChat({ id: chatId });

  // Type guard to determine if a message is a CustomMessage
  const isCustomMessage = (msg: Message | CustomMessage): msg is CustomMessage => {
    return 'chatId' in msg;
  };

  // Stream reasoning steps during loading
  useEffect(() => {
    if (isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user') {
      append({
        role: 'assistant',
        content: '',
        reasoning: 'Analyzing response...',
      });
      
      setMessages(prevMessages => {
        const lastAssistantMessageIndex = prevMessages.findIndex(m => m.role === 'assistant');
        if (lastAssistantMessageIndex >= 0) {
          const updatedMessages = [...prevMessages];
          updatedMessages[lastAssistantMessageIndex] = {
            ...updatedMessages[lastAssistantMessageIndex],
            reasoning: ['Analyzing...', 'Processing data...', 'Generating response...'],
          };
          return updatedMessages;
        }
        return prevMessages;
      });
    }
  }, [isLoading, messages, append, chatId, setMessages]);

  // Handle AI-driven edits from chat commands
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'user' && lastMessage.content.startsWith('Edit message')) {
      const match = lastMessage.content.match(/Edit message (\w+) to say: (.+)/);
      if (match) {
        const messageId = match[1];
        const newContent = match[2];
        setMessages(prev => prev.map(m => 
          m.id === messageId ? { ...m, content: newContent } : m
        ));
      }
    }
  }, [messages, setMessages]);

  // Pre-process MDX content at build time (static rendering)
  const processedMessages = useMemo(() => {
    return messages.map(async (message) => {
      if (typeof message.content === 'string' && message.content.includes('.mdx')) {
        const mdxSource = await serialize(message.content, {
          mdxOptions: {
            remarkPlugins: [require('remark-gfm')],
            rehypePlugins: [require('rehype-highlight'), require('rehype-raw')],
          },
        });
        return { ...message, mdxSource } as CustomMessage;
      }
      return message as CustomMessage;
    });
  }, [messages]);

  return (
    <div
      ref={messagesContainerRef}
      className={cn("flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4", className)}
    >
      {messages.length === 0 && <Overview />}
      
      {messages.map((message, index) => (
        <div key={message.id} className="mb-4">
          <PreviewMessage
            chatId={chatId}
            message={message}
            isLoading={isLoading && messages.length - 1 === index}
            vote={
              votes
                ? votes.find((vote) => vote.messageId === message.id)
                : undefined
            }
            setMessages={setMessages}
            reload={reload}
            isReadonly={isReadonly}
          />
          
          {message.sources && (
            <footer className="mt-2 p-2 bg-gray-800 rounded text-white text-sm">
              <button
                onClick={() => {/* Toggle visibility (implement if needed) */}}
                className="flex items-center gap-1 mb-2 text-sm underline hover:text-blue-400"
              >
                Sources <ChevronDownIcon size={12} />
              </button>
              <ul className="list-disc pl-4 max-h-20 overflow-y-auto">
                {message.sources.map((source, index) => (
                  <li key={index} className="truncate">
                    
                      href={source.url}
                      target="_blank"
                      className="underline hover:text-blue-400"
                      onMouseEnter={() => {/* Show tooltip with full URL (implement if needed) */}}
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </footer>
          )}
          
          {message.reasoning && (
            <footer className="mt-2 p-2 bg-gray-600 rounded text-white text-sm">
              <p>Reasoning:</p>
              <ul className="list-disc pl-4 max-h-20 overflow-y-auto">
                {Array.isArray(message.reasoning) 
                  ? message.reasoning.map((step, index) => (
                      <li key={index} className="truncate">{step}</li>
                    ))
                  : typeof message.reasoning === 'string' ? <li>{message.reasoning}</li> : null}
              </ul>
            </footer>
          )}
        </div>
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
  if (prevProps.isArtifactVisible && nextProps.isArtifactVisible) return true;
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.isLoading && nextProps.isLoading) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;
  if (!equal(prevProps.votes, nextProps.votes)) return false;
  return true;
});
