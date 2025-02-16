'use client';

import type { Message, CreateMessage } from 'ai';
import cx from 'classnames';
import React, {
  memo,
  useRef,
  useState,
  useCallback,
  useEffect,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction
} from 'react';
import { toast } from 'sonner';
import { useLocalStorage, useWindowSize } from 'usehooks-ts';
import equal from 'fast-deep-equal';

import { sanitizeUIMessages } from '@/lib/utils';
import { SuggestedActions } from './suggested-actions';
import { PreviewAttachment } from './preview-attachment';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ArrowUpIcon, PaperclipIcon, StopIcon } from './icons';

/** 
 * Minimal type for front-end "attachment."
 * Store the raw File plus a name for preview.
 */
type Attachment = {
  file: File;
  name: string;
};

function PureMultimodalInput({
  chatId,
  messages,
  setMessages,
  isLoading,
  stop,
  /** 
   * This handleSend will be invoked when user hits "Send."
   * We'll pass { text, files }, so you can do one request with everything. 
   */
  handleSend,
  className
}: {
  chatId: string;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  isLoading: boolean;
  stop: () => void;
  handleSend: (payload: { text: string; files: File[] }) => Promise<void>;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();

  /** local text state */
  const [input, setInput] = useState('');
  const [localStorageInput, setLocalStorageInput] = useLocalStorage('input', '');

  /** store selected attachments locally */
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  /** auto-adjust the textarea height */
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
    // run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  /** handle text input */
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    adjustHeight();
  };

  /** file input ref */
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** user selects file(s) -> store them in "attachments" without uploading separately */
  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    /** build attachments */
    const newAttachments = files.map((file) => ({
      file,
      name: file.name
    }));

    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  /** user hits "Send" */
  const submitForm = useCallback(() => {
    if (!input.trim() && attachments.length === 0) {
      toast.error('Please enter text or select a file.');
      return;
    }
    if (isLoading) {
      toast.error('Please wait for the current response to finish.');
      return;
    }

    // pass everything to handleSend
    handleSend({
      text: input,
      files: attachments.map((a) => a.file)
    });

    // reset local state
    setAttachments([]);
    setInput('');
    setLocalStorageInput('');
    resetHeight();

    // if on desktop, refocus
    if (width && width > 768) {
      textareaRef.current?.focus();
    }

    // update the URL if you like
    window.history.replaceState({}, '', `/chat/${chatId}`);
  }, [input, attachments, handleSend, isLoading, width, chatId, setLocalStorageInput]);

  return (
    <div className="relative w-full flex flex-col gap-4">
      {messages.length === 0 && attachments.length === 0 && (
        <SuggestedActions chatId={chatId} />
      )}

      {/* hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        onChange={handleFileChange}
      />

      {/* preview attachments if any */}
      {attachments.length > 0 && (
        <div className="flex flex-row gap-2 overflow-x-scroll items-end">
          {attachments.map((att, idx) => (
            <PreviewAttachment
              key={`${att.name}-${idx}`}
              attachment={{
                url: '', // no upload done yet
                name: att.name,
                contentType: att.file.type
              }}
            />
          ))}
        </div>
      )}

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

      {/* Button row */}
      <div className="absolute bottom-0 p-2 w-fit flex flex-row gap-2 items-center justify-end right-0">
        {isLoading ? (
          <Button
            className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
            onClick={(e) => {
              e.preventDefault();
              stop();
              setMessages((msgs) => sanitizeUIMessages(msgs));
            }}
          >
            <StopIcon size={14} />
          </Button>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

/**
 *  Export a memoized version if you want to avoid re-renders.
 */
export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.messages !== nextProps.messages) return false;
    return true;
  }
);
