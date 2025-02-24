// components/chat.tsx
'use client';

import type { Attachment, Message } from 'ai';
import { useChat } from 'ai/react';
import { useState, useEffect, Component, ReactNode } from 'react';
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

// Error Boundary component to catch and handle React errors
class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("ChatComponent Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

// The main Chat component wrapped with error handling
export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
  onSpreadsheetDataUpdate,
}: {
  id: string;
  initialMessages: Array<Message>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  onSpreadsheetDataUpdate?: (data: any, documentId: string) => void;
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col min-w-0 h-dvh bg-background">
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-4">
              <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
              <p className="mb-4">The chat interface encountered an error.</p>
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      }
    >
      <ChatContent
        id={id}
        initialMessages={initialMessages}
        selectedChatModel={selectedChatModel}
        selectedVisibilityType={selectedVisibilityType}
        isReadonly={isReadonly}
        onSpreadsheetDataUpdate={onSpreadsheetDataUpdate}
      />
    </ErrorBoundary>
  );
}

// The actual chat content, separated to work with the error boundary
function ChatContent({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
  onSpreadsheetDataUpdate,
}: {
  id: string;
  initialMessages: Array<Message>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  onSpreadsheetDataUpdate?: (data: any, documentId: string) => void;
}) {
  const { mutate } = useSWRConfig();
  const [errorShown, setErrorShown] = useState(false);

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
      // Only show one toast to avoid multiple errors
      if (!errorShown) {
        toast.error('An error occurred, please try again!');
        setErrorShown(true);
        setTimeout(() => setErrorShown(false), 3000); // Reset after 3 seconds
      }
    },
    onResponse: (response) => {
      try {
        // Safety check for response undefined
        if (!response) {
          console.error('Response object is undefined');
          return;
        }
        
        // Safely access status
        const status = response?.status;
        if (status === 429) {
          toast.error('Too many requests. Please try again later.');
          return;
        }
        
        // Skip processing if no callback or no body
        if (!onSpreadsheetDataUpdate || !response.body) {
          return;
        }
        
        const reader = response.body.getReader();
        if (!reader) {
          return;
        }

        const decoder = new TextDecoder();
        let accumulatedData = '';

        const processStream = async ({ done, value }: { done: boolean; value?: Uint8Array }) => {
          try {
            if (done) {
              if (!accumulatedData || accumulatedData.trim() === '') {
                return;
              }
              
              try {
                const jsonData = JSON.parse(accumulatedData);
                if (jsonData.spreadsheetData || jsonData.updatedData) {
                  const data = jsonData.spreadsheetData || jsonData.updatedData;
                  onSpreadsheetDataUpdate(data, id);
                }
              } catch (e) {
                console.error('Error parsing response:', e);
              }
              return;
            }
            
            if (value) {
              accumulatedData += decoder.decode(value, { stream: true });
              reader.read().then(processStream).catch(() => {});
            }
          } catch (error) {
            console.error('Stream processing error:', error);
          }
        };
        
        reader.read().then(processStream).catch(() => {});
      } catch (error) {
        console.error('Response handling error:', error);
      }
    },
  });

  // Fetch votes with error handling
  const { data: votes } = useSWR<Array<Vote>>(
    `/api/vote?chatId=${id}`,
    fetcher,
    {
      onError: (error) => {
        console.error('Error fetching votes:', error);
      }
    }
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);
  
  // Always provide safe defaults
  const safeVotes = votes || [];

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
