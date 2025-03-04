'use client';

import type { ChatRequestOptions, Message } from 'ai';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { Fragment, memo, useCallback, useEffect, useState } from 'react';

import type { Vote } from '@/lib/db/schema';
import { CustomMessage } from '@/lib/types'; // Import CustomMessage with reasoning: string[] | undefined

import { DocumentToolCall, DocumentToolResult } from './document';
import {
  ChevronDownIcon,
  LoaderIcon,
  PencilEditIcon,
  SparklesIcon,
} from './icons';
import { evaluate } from '@mdx-js/mdx';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import { Weather } from './weather';
import equal from 'fast-deep-equal';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { DocumentPreview } from './document-preview';
import { MessageReasoning } from './message-reasoning';
import { useChat } from 'ai/react';

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

// Type guard to determine if the message is a CustomMessage - moved outside the component
const isCustomMessage = (msg: Message | CustomMessage): msg is CustomMessage => {
  return 'chatId' in msg && typeof msg.chatId === 'string';
};

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  reload,
  isReadonly,
}: {
  chatId: string;
  message: Message | CustomMessage; // Updated to support both Message and CustomMessage
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: (
    messages: CustomMessage[] | ((messages: CustomMessage[]) => CustomMessage[]), // Updated to strictly CustomMessage[]
  ) => void; // Updated to strictly CustomMessage[]
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const { append } = useChat({ id: chatId });

  // Create a wrapper function to adapt setMessages to the expected type
  const setMessagesAdapter = useCallback((messagesOrUpdater: Message[] | ((messages: Message[]) => Message[])) => {
    if (typeof messagesOrUpdater === 'function') {
      // Handle function updater
      setMessages((prevCustomMessages) => {
        // Convert CustomMessages to Messages for the updater function
        const prevAsMessages = prevCustomMessages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt,
          reasoning: msg.reasoning && msg.reasoning.length > 0 ? msg.reasoning[0] : undefined
        }));
        
        // Apply the updater function
        const updatedMessages = messagesOrUpdater(prevAsMessages);
        
        // Convert Messages back to CustomMessages
        return updatedMessages.map(msg => ({
          ...msg,
          chatId,
          reasoning: msg.reasoning || undefined,
        })) as CustomMessage[];
      });
    } else {
      // Handle direct array assignment
      setMessages(messagesOrUpdater.map(msg => ({
        ...msg,
        chatId,
        reasoning: msg.reasoning || undefined,
      })) as CustomMessage[]);
    }
  }, [setMessages, chatId]);

  // Handle AI-driven edits via chat commands
  const handleAIEdit = useCallback(async (newContent: string) => {
    if (isReadonly) return;
    setMessages(prev => prev.map(m =>
      m.id === message.id ? { ...m, content: newContent } : m
    ));
    await append({
      role: 'user',
      content: `Edit message ${message.id} to say: ${newContent}`,
    });
  }, [message.id, setMessages, append, isReadonly]);

  // Evaluate MDX content dynamically (runtime)
  const [MDXContent, setMDXContent] = useState<any>(null);
  useEffect(() => {
    if (typeof message.content === 'string') {
      evaluate(message.content, { Fragment })
        .then(setMDXContent)
        .catch(console.error);
    }
  }, [message.content]);

  // Handle reasoning based on message type - fixing the string[] vs string issue
const reasoning = message.reasoning;

  return (
    <AnimatePresence>
      <motion.div
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
            {
              'w-full': mode === 'edit',
              'group-data-[role=user]/message:w-fit': mode !== 'edit',
            },
          )}
        >
          {message.role === 'assistant' && (
            <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 w-full">
            {message.experimental_attachments && (
              <div className="flex flex-row justify-end gap-2">
                {message.experimental_attachments.map((attachment) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={attachment}
                  />
                ))}
              </div>
            )}

            {reasoning && (
              <MessageReasoning
                isLoading={isLoading}
                reasoning={reasoning} // Now passing string
              />
            )}

            {(message.content || reasoning) && mode === 'view' && (
              <div className="flex flex-row gap-2 items-start">
                {message.role === 'user' && !isReadonly && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                          onClick={() => {
                            setMode('edit');
                          }}
                        >
                          <PencilEditIcon />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit message</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                          onClick={() => handleAIEdit('New content example')}
                        >
                          AI Edit
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>AI Edit Message</TooltipContent>
                    </Tooltip>
                  </>
                )}

                <div
                  className={cn('flex flex-col gap-4', {
                    'bg-primary text-primary-foreground px-3 py-2 rounded-xl':
                      message.role === 'user',
                  })}
                >
                  {MDXContent ? MDXContent : message.content}
                </div>
              </div>
            )}

            {message.content && mode === 'edit' && (
              <div className="flex flex-row gap-2 items-start">
                <div className="size-8" />

                <MessageEditor
                  key={message.id}
                  message={message as Message} // Cast to Message for MessageEditor
                  setMode={setMode}
                  setMessages={setMessagesAdapter} // Use the adapter function
                  reload={reload}
                />
              </div>
            )}

            {message.toolInvocations && message.toolInvocations.length > 0 && (
              <div className="flex flex-col gap-4">
                {message.toolInvocations.map((toolInvocation) => {
                  const { toolName, toolCallId, state, args } = toolInvocation;

                  if (state === 'result') {
                    const { result } = toolInvocation;

                    return (
                      <div key={toolCallId}>
                        {toolName === 'getWeather' ? (
                          <Weather weatherAtLocation={result} />
                        ) : toolName === 'createDocument' ? (
                          <DocumentPreview
                            isReadonly={isReadonly}
                            result={result}
                          />
                        ) : toolName === 'updateDocument' ? (
                          <DocumentToolResult
                            type="update"
                            result={result}
                            isReadonly={isReadonly}
                          />
                        ) : toolName === 'requestSuggestions' ? (
                          <DocumentToolResult
                            type="request-suggestions"
                            result={result}
                            isReadonly={isReadonly}
                          />
                        ) : (
                          <pre>{JSON.stringify(result, null, 2)}</pre>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={toolCallId}
                      className={cx({
                        skeleton: ['getWeather'].includes(toolName),
                      })}
                    >
                      {toolName === 'getWeather' ? (
                        <Weather />
                      ) : toolName === 'createDocument' ? (
                        <DocumentPreview isReadonly={isReadonly} args={args} />
                      ) : toolName === 'updateDocument' ? (
                        <DocumentToolCall
                          type="update"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'requestSuggestions' ? (
                        <DocumentToolCall
                          type="request-suggestions"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message as Message} // Cast to Message for MessageActions, assuming it expects Message
                vote={vote}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    // Adjust reasoning comparison to match our new approach
    const prevReasoning = isCustomMessage(prevProps.message)
      ? prevProps.message.reasoning && prevProps.message.reasoning.length > 0 
        ? prevProps.message.reasoning[0] : undefined
      : prevProps.message.reasoning;
    
    const nextReasoning = isCustomMessage(nextProps.message)
      ? nextProps.message.reasoning && nextProps.message.reasoning.length > 0 
        ? nextProps.message.reasoning[0] : undefined
      : nextProps.message.reasoning;
      
    if (prevReasoning !== nextReasoning) return false;
    if (prevProps.message.content !== nextProps.message.content) return false;
    if (
      !equal(
        prevProps.message.toolInvocations,
        nextProps.message.toolInvocations,
      )
    )
      return false;
    if (!equal(prevProps.vote, nextProps.vote)) return false;

    return true;
  },
);

export const ThinkingMessage = () => {
  const role = 'assistant';
  const [status, setStatus] = useState('Thinking...');

  // Simulate or stream status updates (replace with actual streaming logic)
  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(prev => 
        prev === 'Thinking...' ? 'Processing...' : 'Analyzing...'
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cx(
          'flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl',
          {
            'group-data-[role=user]/message:bg-muted': true,
          },
        )}
      >
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="animate-pulse">● ● ●</span>
            <span>{status}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
