// components/chat.tsx
'use client';

import type { Attachment, Message } from 'ai';
import { useChat } from 'ai/react';
import { useState } from 'react';
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
  onSpreadsheetDataUpdate, // Optional prop
}: {
  id: string;
  initialMessages: Array<Message>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  onSpreadsheetDataUpdate?: (data: any, documentId: string) => void; // Optional callback
}) {
  const { mutate } = useSWRConfig();

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
    },
    onResponse: (response) => {
      // Add null check to prevent "Cannot read properties of undefined (reading 'status')" error
      if (!response) {
        console.error('Response object is undefined');
        return;
      }
      
      if (response.status === 429) {
        toast.error('Too many requests. Please try again later.');
        return;
      }
      
      // Add null check on response.body
      if (!response.body) {
        console.error('Response body is undefined');
        return;
      }
      
      const reader = response.body.getReader();
      // Only process stream if we have a reader and the onSpreadsheetDataUpdate callback
      if (!reader || !onSpreadsheetDataUpdate) return;

      const decoder = new TextDecoder();
      let accumulatedData = '';

      const processStream = async ({ done, value }: { done: boolean; value?: Uint8Array }) => {
        if (done) {
          try {
            // Add check to make sure accumulatedData is not empty
            if (accumulatedData.trim() === '') {
              console.warn('Accumulated data is empty, skipping JSON parsing');
              return;
            }
            
            const jsonData = JSON.parse(accumulatedData);
            if (jsonData.spreadsheetData || jsonData.updatedData) {
              const data = jsonData.spreadsheetData || jsonData.updatedData;
              onSpreadsheetDataUpdate(data, id); // Call the callback with data and chat ID
            }
          } catch (e) {
            console.error('Error parsing response:', e);
          }
          return;
        }
        
        // Add null check for value
        if (!value) {
          console.error('Stream value is undefined');
          return;
        }
        
        accumulatedData += decoder.decode(value, { stream: true });
        reader.read().then(processStream);
      };
      
      reader.read().then(processStream);
    },
  });

  const { data: votes } = useSWR<Array<Vote>>(
    `/api/vote?chatId=${id}`,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedModelId={selectedChatModel}
          selectedVisibilityType={selectedVisibilityType}
          isReadonly={isReadonly}
        />

        <Messages
          chatId={id}
          isLoading={isLoading}
          votes={votes}
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
        votes={votes}
        isReadonly={isReadonly}
      />
    </>
  );
}
