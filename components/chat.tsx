'use client';

import type { Attachment, Message } from 'ai';
import { useChat } from 'ai/react';
import { useState, useRef, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';

import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';

import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { toast } from 'sonner';

export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
  onSpreadsheetDataUpdate, // Added prop
}: {
  id: string;
  initialMessages: Array<Message>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  onSpreadsheetDataUpdate?: (data: any, documentId: string) => void; // Optional callback
}) {
  const { mutate } = useSWRConfig();
  const containerRef = useRef<HTMLDivElement>(null); // Ref for DOM safety

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    isLoading,
    stop,
    reload,
  } = useChat({
    id,
    body: { id, selectedChatModel: selectedChatModel },
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onFinish: () => {
      mutate('/api/history');
    },
    onError: (error) => {
      toast.error('An error occurred, please try again!');
      console.error('Chat error:', error);
    },
    onResponse: (response) => {
      // Enhanced null check for response
      if (!response) {
        console.error('Response object is undefined');
        return;
      }

      if (response.status === 429) {
        toast.error('Too many requests. Please try again later.');
        return;
      }

      // Only proceed if we have a response body and the callback
      if (!response.body || !onSpreadsheetDataUpdate) {
        return;
      }

      const reader = response.body.getReader();
      if (!reader) {
        console.warn('No reader available in response body');
        return;
      }

      const decoder = new TextDecoder();
      let accumulatedData = '';

      const processStream = async ({ done, value }: { done: boolean; value?: Uint8Array }) => {
        if (done) {
          try {
            if (!accumulatedData || accumulatedData.trim() === '') {
              return;
            }
            const jsonData = JSON.parse(accumulatedData);
            if (jsonData.spreadsheetData || jsonData.updatedData) {
              const data = jsonData.spreadsheetData || jsonData.updatedData;
              onSpreadsheetDataUpdate(data, id); // Call the callback with data and chat ID
            }
          } catch (e) {
            console.error('Error parsing response stream:', e);
          }
          return;
        }

        if (!value) {
          console.warn('Stream value is undefined');
          return;
        }

        accumulatedData += decoder.decode(value, { stream: true });
        reader.read().then(processStream).catch(err => {
          console.error('Stream reading error:', err);
        });
      };

      reader.read().then(processStream).catch(err => {
        console.error('Initial stream read error:', err);
      });
    },
  });

  const { data: votes } = useSWR<Array<Vote>>(
    `/api/vote?chatId=${id}`,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  // Use safe votes to prevent null reference errors
  const safeVotes = votes || [];

  // Ensure DOM is ready before any manipulation
  useEffect(() => {
    if (containerRef.current) {
      // Add any necessary DOM initialization here if needed
      console.log('Chat container mounted');
    }
  }, []);

  return (
    <>
      <div ref={containerRef} className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedModelId={selectedChatModel}
          selectedVisibilityType={selectedVisibilityType}
          isReadonly={isReadonly}
        />

        <Messages
          chatId={id}
          isLoading={isLoading}
          votes={safeVotes}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          isArtifactVisible={isArtifactVisible}
        />

        <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
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
              setMessages={setMessages}
              append={append}
            />
          )}
        </form>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        votes={safeVotes}
        isReadonly={isReadonly}
      />
    </>
  );
}
