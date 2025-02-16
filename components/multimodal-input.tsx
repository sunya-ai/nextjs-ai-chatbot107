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
 * "Attachment" is the same type your old code used,
 * but if your old code stored { url: string }, you must store { file: File } instead for single-step.
 */
type Attachment = {
  file: File;
  name: string;
  type: string;
};

/**
 * This version preserves the old external prop signature:
 *   - input, setInput, handleSubmit, attachments, setAttachments, ...
 * but *internally*, it does a single-step approach (one call to /api/chat).
 */
function PureMultimodalInput({
  // old external props
  chatId,
  input,
  setInput,
  handleSubmit, // (we can still call it inside or ignore it)
  attachments,
  setAttachments,

  messages,
  setMessages,

  isLoading,
  stop,
  className,
}: {
  chatId: string;
  input: string;
  setInput: (val: string) => void;
  handleSubmit: (
    event?: { preventDefault?: () => void },
    chatRequestOptions?: { experimental_attachments: any[] }
  ) => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;

  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;

  isLoading: boolean;
  stop: () => void;
  className?: string;
}) {
  const { width } = useWindowSize();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // We'll store text in local state + localStorage just like old code
  const [localStorageInput, setLocalStorageInput] = useLocalStorage('input', '');

  // auto-resize logic
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

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      adjustHeight();
    },
    [setInput]
  );

  // Instead of immediate uploading to /api/files/upload, we store raw files in "attachments"
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      // For each selected file, store it as { file, name, type } 
      const newAttachments = files.map((file) => ({
        file,
        name: file.name,
        type: file.type,
      }));

      // Merge into attachments
      setAttachments((prev) => [...prev, ...newAttachments]);
    },
    [setAttachments]
  );

  /**
   * The single-step approach behind "submitForm":
   * 1) Build a FormData with (id, messages + user input, model)
   * 2) Add each file in attachments
   * 3) fetch('/api/chat', ...) 
   * 4) Optionally call old handleSubmit for backward compat
   */
  const singleStepSubmit = useCallback(() => {
    if (isLoading) {
      toast.error('Please wait until the current response finishes!');
      return;
    }

    if (!input.trim() && attachments.length === 0) {
      toast.error('Please enter text or select files first.');
      return;
    }

    // Build the form
    const formData = new FormData();
    formData.append('id', chatId);

    // Combine existing messages + new user message
    const newMessages = [...messages, { role: 'user', content: input }];
    formData.append('messages', JSON.stringify(newMessages));
    formData.append('selectedChatModel', 'default-model'); // or your custom model

    // Add each file
    attachments.forEach((att) => {
      formData.append('file', att.file);
    });

    // do the single-step fetch
    fetch('/api/chat', { method: 'POST', body: formData })
      .then(() => {
        // success? do any UI updates
      })
      .catch((err) => {
        console.error('Single-step chat error:', err);
        toast.error('Chat submission failed, please retry.');
      });

    // Clear local data
    setAttachments([]);
    setInput('');
    setLocalStorageInput('');
    resetHeight();
    if (width && width > 768) {
      textareaRef.current?.focus();
    }
    window.history.replaceState({}, '', `/chat/${chatId}`);

    // call the old "handleSubmit" if you want to preserve that logic
    // handleSubmit(undefined, { experimental_attachments: attachments });
  }, [
    isLoading,
    input,
    attachments,
    chatId,
    messages,
    setInput,
    setAttachments,
    setLocalStorageInput,
    resetHeight,
    width,
    textareaRef,
    handleSubmit, // optional
  ]);

  // If your old code calls "submitForm()" on Enter or Send button, we do singleStepSubmit now
  const submitForm = useCallback(() => {
    singleStepSubmit();
  }, [singleStepSubmit]);

  return (
    <div className="relative w-full flex flex-col gap-4">
      {messages.length === 0 && attachments.length === 0 && (
        <SuggestedActions chatId={chatId} />
      )}

      {/* hidden file input => single-step now, no /api/files/upload */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        onChange={handleFileChange}
      />

      {/* Preview attachments locally */}
      {attachments.length > 0 && (
        <div className="flex flex-row gap-2 overflow-x-scroll items-end">
          {attachments.map((att, idx) => (
            <PreviewAttachment
              key={`${att.name}-${idx}`}
              attachment={{
                url: '', // we don't have a URL, it's not uploaded
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

      {/* bottom left => attach button */}
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

      {/* bottom right => stop or send */}
      <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row gap-2 justify-end">
        {isLoading ? (
          <Button
            className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
            onClick={(e) => {
              e.preventDefault();
              stop();
              // sanitize
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

// Keep the same name + memo check
export const MultimodalInput = memo(
  PureMultimodalInput,
  (prev, next) => {
    if (prev.input !== next.input) return false;
    if (prev.isLoading !== next.isLoading) return false;
    if (!equal(prev.attachments, next.attachments)) return false;
    return true;
  },
);
