import { ChatRequestOptions, Message } from 'ai';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Overview } from './overview';
import { memo } from 'react';
import { Vote } from '@/lib/db/schema';
import equal from 'fast-deep-equal';
import { MDXRuntime } from '@mdx-js/runtime'; // Import MDX runtime
import { useChat } from 'ai/react'; // Add for streaming

interface MessagesProps {
  chatId: string;
  isLoading: boolean;
  votes: Array<Vote> | undefined;
  messages: Array<Message>;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
  isArtifactVisible: boolean;
}

// Define custom MDX components for interactivity
const customComponents = {
  button: ({ children, onClick }) => (
    <button onClick={onClick} className="bg-blue-500 text-white px-2 py-1 rounded">
      {children}
    </button>
  ),
  form: ({ children, onSubmit }) => (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      {children}
    </form>
  ),
  input: (props) => <input {...props} className="border p-1 rounded" />,
};

function PureMessages({
  chatId,
  isLoading,
  votes,
  messages,
  setMessages,
  reload,
  isReadonly,
}: MessagesProps) {
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  const { append } = useChat({ id: chatId }); // Integrate useChat for streaming

  // Stream reasoning steps during loading
  useEffect(() => {
    if (isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user') {
      append({
        role: 'assistant',
        content: '',
        reasoning: ['Analyzing...', 'Processing data...', 'Generating response...'],
      });
    }
  }, [isLoading, messages, append]);

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

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
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
                    <a
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
