'use client';

import type React from 'react';
import type { ChatRequestOptions, Message } from 'ai';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useState, useEffect, useCallback } from 'react';
import type { Vote } from '@/lib/db/schema';
import { DocumentToolCall, DocumentToolResult } from './document';
import { PencilEditIcon, SparklesIcon } from './icons';
import { Markdown } from './markdown'; // Updated to MDX version
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
import { useTheme } from 'next-themes'; // For theme-aware rendering

type MessageProps = Message & {
  sources?: { id: string; url: string }[]; // For v0-style source previews
  isThinking?: boolean; // For Grok 3 thinking state
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
  message: MessageProps;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: (messages: Message[] | ((messages: Message[]) => Message[])) => void;
  reload: (chatRequestOptions?: ChatRequestOptions) => Promise<string | null | undefined>;
  isReadonly: boolean;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const { theme } = useTheme();

  // Parse Clearbit logos from content (assumes markdown links like [Company](logo:https://logo.clearbit.com/domain))
  const parseLogos = useCallback((text: string) => {
    const logoRegex = /\[([^\]]+)\]\(logo:([^)]+)\)/g;
    return text.replace(logoRegex, (match, company, logoUrl) => {
      return `<img src="${logoUrl}" alt="${company} logo" className="inline h-6 w-auto mr-2" />${company}`;
    });
  }, []);

  // Serialize content for MDX if needed (optional, based on route.ts output)
  const [renderedContent, setRenderedContent] = useState<string>(typeof message.content === 'string' ? parseLogos(message.content) : '');

  useEffect(() => {
    if (typeof message.content === 'string') {
      setRenderedContent(parseLogos(message.content));
    }
  }, [message.content, parseLogos]);

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
                <SparklesIcon size={12} /> {/* Use size prop */}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 w-full">
            {message.experimental_attachments && (
              <div className="flex flex-row justify-end gap-2">
                {message.experimental_attachments.map((attachment) => (
                  <PreviewAttachment key={attachment.url} attachment={attachment} />
                ))}
              </div>
            )}

            {message.reasoning && <MessageReasoning isLoading={isLoading} reasoning={message.reasoning} />}

            {(message.content || message.reasoning) && mode === 'view' && (
              <div className="flex flex-row gap-2 items-start">
                {message.role === 'user' && !isReadonly && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                        onClick={() => setMode('edit')}
                      >
                        <PencilEditIcon size={12} /> {/* Use size prop */}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit message</TooltipContent>
                  </Tooltip>
                )}

                <div
                  className={cn('flex flex-col gap-4', {
                    'bg-primary text-primary-foreground px-3 py-2 rounded-xl': message.role === 'user',
                  })}
                >
                  <Markdown>{renderedContent}</Markdown>
                </div>
              </div>
            )}

            {message.content && mode === 'edit' && (
              <div className="flex flex-row gap-2 items-start">
                <div className="size-8" />

                <MessageEditor
                  key={message.id}
                  message={message}
                  setMode={setMode}
                  setMessages={setMessages}
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
                          <DocumentPreview isReadonly={isReadonly} result={result} />
                        ) : toolName === 'updateDocument' ? (
                          <DocumentToolResult type="update" result={result} isReadonly={isReadonly} />
                        ) : toolName === 'requestSuggestions' ? (
                          <DocumentToolResult type="request-suggestions" result={result} isReadonly={isReadonly} />
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
                        <DocumentToolCall type="update" args={args} isReadonly={isReadonly} />
                      ) : toolName === 'requestSuggestions' ? (
                        <DocumentToolCall type="request-suggestions" args={args} isReadonly={isReadonly} />
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
                message={message}
                vote={vote}
                isLoading={isLoading}
              />
            )}
            {message.sources && message.sources.length > 0 && (
              <div className="mt-4">
                <Markdown>{`Sources: ${message.sources.map((s, i) => `[${i + 1}](${s.url})`).join(', ')}`}</Markdown>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

PurePreviewMessage.displayName = 'PreviewMessage';

export const PreviewMessage = memo(PurePreviewMessage, (prevProps, nextProps) => {
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.message.reasoning !== nextProps.message.reasoning) return false;
  if (prevProps.message.content !== nextProps.message.content) return false;
  if (!equal(prevProps.message.toolInvocations, nextProps.message.toolInvocations)) return false;
  if (!equal(prevProps.vote, nextProps.vote)) return false;
  if (!equal(prevProps.message.sources, nextProps.message.sources)) return false; // Add sources comparison

  return true;
});

interface ThinkingMessageProps {
  currentMessage?: string;
}

export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({ currentMessage }) => {
  const role = 'assistant';

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
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
          <SparklesIcon size={12} /> {/* Use size prop */}
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="text-zinc-500 dark:text-zinc-400 animate-pulse flex items-center gap-2">
            <span>Thinking</span>
            <span className="thinking-dots" />
            <span className="thinking-dots" />
            <span className="thinking-dots" />
          </div>
        </div>
      </div>
    </motion.div>
  );
};
