'use client';

import type { Message } from 'ai';
import React, {
  memo,
  useRef,
  useEffect,
  useState,
  useCallback,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction
} from 'react';
import { toast } from 'sonner';
import { useLocalStorage, useWindowSize } from 'usehooks-ts';
import cx from 'classnames';

import { sanitizeUIMessages } from '@/lib/utils';

import { ArrowUpIcon, PaperclipIcon, StopIcon } from './icons';
import { PreviewAttachment } from './preview-attachment';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { SuggestedActions } from './suggested-actions';
import equal from 'fast-deep-equal';

/**
 * We'll define an Attachment shape for local preview.
 * Instead of { url, contentType }, we keep the raw File and show it.
 */
type Attachment = {
  file: File;     // The actual file object
  name: string;   // file.name
  type: string;   // file.type
};

/**
 * Props:
 * - We keep local text in `input`.
 * - We store selected files in `attachments`.
 * - On "Send", we do one "handleSend" with FormData -> server.
 * - We maintain the advanced local logic (localStorage input, auto-resize, etc).
 */
function PureMultimodalInput({
  chatId,
  messages,
  setMessages,
  isLoading,
  stop,
  handleSend, // We'll define it to do the single "multipart" request
  className
}: {
  chatId: string;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  isLoading: boolean;
  stop: () => void;
  /**
   * handleSend(formData) => parent fetches /api/chat with the raw file + user text
   */
  handleSend: (formData: FormData) => Promise<void>;
  className?: string;
}) {
  const { width } = useWindowSize();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** local text input */
  const [input, setInput] = useState('');
  const [localStorageInput, setLocalStorageInput] = useLocalStorage('input', '');

  /** local array of attachments, each storing the actual File for preview & final send */
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  //
  // =============== Textarea Auto-Resize & Local Storage ===============
  //
  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  };

  const resetHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = '98px';
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      // prefer DOM-hydrated text over localStorage
      const domValue = textareaRef.current.value;
      const finalValue = domValue || localStorageInput || '';
      setInput(finalValue);
      adjustHeight();
    }
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    adjustHeight();
  };

  //
  // =============== File Selection, Single Step ===============
  //
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** user picks one or more files (but we do NOT upload them to a public URL) */
  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Store them in local attachments array
    const newAttachments: Attachment[] = files.map((f) => ({
      file: f,
      name: f.name,
      type: f.type
    }));

    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  //
  // =============== "Send" => single request ===============
  //
  const submitForm = useCallback(() => {
    if (!input.trim() && attachments.length === 0) {
      toast.error('Please enter some text or select a file');
      return;
    }
    if (isLoading) {
      toast.error('Wait for the current response to finish');
      return;
    }

    // Build FormData
    const formData = new FormData();
    formData.append('id', chatId);

    // We'll pass the current message array + new user message as JSON
    const newMessages = [
      ...messages,
      { role: 'user', content: input }
    ];

    formData.append('messages', JSON.stringify(newMessages));
    formData.append('selectedChatModel', 'models/gemini-2.0-flash'); 
    // or any model you prefer

    // attach each file
    attachments.forEach((att) => {
      formData.append('file', att.file); 
      // If you wanted multiple files, you can do formData.append('files', att.file)
      // but you'd parse that differently in the route
    });

    // Call parent's handleSend => triggers fetch('/api/chat', { body: formData })
    handleSend(formData);

    // reset local
    setAttachments([]);
    setInput('');
    setLocalStorageInput('');
    resetHeight();

    if (width && width > 768) {
      textareaRef.current?.focus();
    }

    // update URL
    window.history.replaceState({}, '', `/chat/${chatId}`);
  }, [
    input,
    attachments,
    messages,
    isLoading,
    handleSend,
    setLocalStorageInput,
    chatId,
    width
  ]);

  return (
    <div className="relative w-full flex flex-col gap-4">
      {/* If no messages or attachments, we can show suggested actions */}
      {messages.length === 0 && attachments.length === 0 && (
        <SuggestedActions chatId={chatId} />
      )}

      {/* Hidden file input => single-step approach, no immediate upload */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        onChange={handleFileChange}
      />

      {/* If we have attachments, preview them */}
      {attachments.length > 0 && (
        <div className="flex flex-row gap-2 overflow-x-scroll items-end">
          {attachments.map((att, idx) => (
            <PreviewAttachment
              key={`${att.name}-${idx}`}
              attachment={{
                url: '',          // not a public URL
                name: att.name,
                contentType: att.type
              }}
            />
          ))}
        </div>
      )}

      {/* The text area */}
      <Textarea
        ref={textareaRef}
        placeholder="Send a message..."
        value={input}
        onChange={handleInput}
        className={cx(
          'min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl !text-base bg-muted pb-10 dark:border-zinc-700',
          className
        )}
        rows={2}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitForm();
          }
        }}
      />

      {/* Action buttons: on left => "attach file", on right => "stop" or "send" */}
      <div className="absolute bottom-0 p-2 w-fit flex flex-row justify-start">
        {!isLoading && (
          <Button
            className="rounded-md p-[7px] h-fit dark:border-zinc-700 hover:dark:bg-zinc-900 hover:bg-zinc-200"
            onClick={(e) => {
              e.preventDefault();
              fileInputRef.current?.click();
            }}
            disabled={isLoading}
            variant="ghost"
          >
            <PaperclipIcon size={14} />
          </Button>
        )}
      </div>

      <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row gap-2 justify-end">
        {isLoading ? (
          <Button
            className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
            onClick={(e) => {
              e.preventDefault();
              stop();
              // sanitize messages on stop
              setMessages((msgs) => sanitizeUIMessages(msgs));
            }}
          >
            <StopIcon size={14} />
          </Button>
        ) : (
          <Button
            className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
            onClick={(e) => {
              e.preventDefault();
              submitForm();
            }}
            disabled={!input.trim() && attachments.length === 0}
          >
            <ArrowUpIcon size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}

/** 
 * Export a memoized version 
 * we do a shallow compare for isLoading, attachments, etc. 
 */
export const MultimodalInput = memo(PureMultimodalInput, (prev, next) => {
  if (prev.isLoading !== next.isLoading) return false;
  if (prev.messages !== next.messages) return false;
  if (!equal(prev.attachments, next.attachments)) return false;
  if (prev.input !== next.input) return false;
  return true;
});
