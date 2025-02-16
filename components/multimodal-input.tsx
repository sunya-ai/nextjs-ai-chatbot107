'use client';

import type { Message } from 'ai';
import React, {
  type ChangeEvent,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocalStorage, useWindowSize } from 'usehooks-ts';
import { toast } from 'sonner';
import cx from 'classnames';

import { sanitizeUIMessages } from '@/lib/utils';
import { ArrowUpIcon, PaperclipIcon, StopIcon } from './icons';
import { PreviewAttachment } from './preview-attachment';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { SuggestedActions } from './suggested-actions';

type Attachment = {
  url: string;
  name: string;
  contentType: string;
};

function PureMultimodalInput({
  chatId,
  messages,
  setMessages,
  isLoading,
  stop,
  // The parent can define handleSend, which calls "chat" route with the attachments
  handleSend,
  className
}: {
  chatId: string;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isLoading: boolean;
  stop: () => void;
  handleSend: (payload: {
    text: string;
    attachments: Attachment[];
  }) => void;
  className?: string;
}) {
  const { width } = useWindowSize();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // text input
  const [input, setInput] = useState('');
  const [localStorageInput, setLocalStorageInput] = useLocalStorage('input', '');

  // store "attachments" as references (url, name, contentType)
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // track "uploadQueue" just for showing uploading placeholders
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);

  /** Auto-adjust */
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

  /** handle text input */
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    adjustHeight();
  };

  /** hidden file input */
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** user selects file(s) -> upload them immediately to /api/files/upload, store references */
  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploadQueue(files.map((f) => f.name));

    try {
      // For each file, POST to /api/files/upload
      const uploadPromises = files.map((file) => uploadFile(file));
      const results = await Promise.all(uploadPromises);

      // Filter out any undefined
      const successful = results.filter((r) => r !== undefined) as Attachment[];
      // push them to attachments
      setAttachments((prev) => [...prev, ...successful]);
    } catch (err) {
      console.error('Error uploading files:', err);
    } finally {
      setUploadQueue([]);
    }
  }, []);

  /** actually uploads the file to /api/files/upload */
  async function uploadFile(file: File): Promise<Attachment | undefined> {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const { error } = await res.json();
        toast.error(error || 'File upload failed');
        return;
      }

      const data = await res.json();
      // { url, pathname, contentType }
      return {
        url: data.url,
        name: data.pathname,   // e.g. 'filename.png'
        contentType: data.contentType
      };
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload file, try again!');
      return;
    }
  }

  /** user hits "Send" -> call handleSend with the text + attachments references */
  const submitForm = useCallback(() => {
    if (!input.trim() && attachments.length === 0) {
      toast.error('Please enter text or attach a file');
      return;
    }
    if (isLoading) {
      toast.error('Please wait for the model to finish');
      return;
    }

    // pass to parent's handleSend
    handleSend({
      text: input,
      attachments
    });

    // reset local
    setAttachments([]);
    setInput('');
    setLocalStorageInput('');
    resetHeight();

    if (width && width > 768) {
      textareaRef.current?.focus();
    }

    // optional: update URL
    window.history.replaceState({}, '', `/chat/${chatId}`);
  }, [input, attachments, handleSend, isLoading, chatId, width, setLocalStorageInput]);

  return (
    <div className="relative w-full flex flex-col gap-4">
      {/* If there are no messages or attachments, show suggestions */}
      {messages.length === 0 && attachments.length === 0 && uploadQueue.length === 0 && (
        <SuggestedActions chatId={chatId} />
      )}

      {/* hidden file input for immediate upload on select */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* show any attachments (and placeholders if uploading) */}
      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div className="flex flex-row gap-2 overflow-x-scroll items-end">
          {attachments.map((att, idx) => (
            <PreviewAttachment
              key={`${att.url}-${idx}`}
              attachment={{
                url: att.url,
                name: att.name,
                contentType: att.contentType
              }}
            />
          ))}

          {uploadQueue.map((filename) => (
            <PreviewAttachment
              key={filename}
              attachment={{ url: '', name: filename, contentType: '' }}
              isUploading={true}
            />
          ))}
        </div>
      )}

      {/* text area */}
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

      {/* bottom buttons: paperclip + send or stop */}
      <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
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
              className="rounded-md p-[7px] h-fit dark:border-zinc-700 hover:dark:bg-zinc-900 hover:bg-zinc-200 mr-2"
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

export const MultimodalInput = memo(PureMultimodalInput);
