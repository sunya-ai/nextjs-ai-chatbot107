// components/artifact.tsx
import type { Attachment, ChatRequestOptions, CreateMessage, Message } from 'ai';
import { formatDistance } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useDebounceCallback, useWindowSize } from 'usehooks-ts';
import type { Document, Vote } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Toolbar } from './toolbar';
import { VersionFooter } from './version-footer';
import { ArtifactActions } from './artifact-actions';
import { ArtifactCloseButton } from './artifact-close-button';
import { ArtifactMessages } from './artifact-messages';
import { useSidebar } from './ui/sidebar';
import { useArtifact } from '@/hooks/use-artifact';
import { imageArtifact } from '@/artifacts/image/client';
import { codeArtifact } from '@/artifacts/code/client';
import { sheetArtifact } from '@/artifacts/sheet/client';
import { textArtifact } from '@/artifacts/text/client';
import { TableArtifact } from './TableArtifact';
import { ChartArtifact } from './ChartArtifact';
import equal from 'fast-deep-equal';

export const artifactDefinitions = [
  textArtifact,
  codeArtifact,
  imageArtifact,
  sheetArtifact,
  {
    kind: 'table',
    content: ({ content }: { content: string }) => <TableArtifact content={content} />, // Typed content as string
    initialize: () => {},
  },
  {
    kind: 'chart',
    content: ({ content }: { content: string }) => <ChartArtifact content={content} />, // Typed content as string
    initialize: () => {},
  },
] as const;

export type ArtifactKind = (typeof artifactDefinitions)[number]['kind'];

export interface UIArtifact {
  title: string;
  documentId: string;
  kind: ArtifactKind;
  content: string;
  isVisible: boolean;
  status: 'streaming' | 'idle';
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

async function fetchSavedArtifacts(): Promise<UIArtifact[]> {
  try {
    const savedData = localStorage.getItem('savedArtifacts');
    if (!savedData) return [];
    
    const parsed = JSON.parse(savedData);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Error fetching saved artifacts:", error);
    return [];
  }
}

async function saveNewArtifact(artifact: UIArtifact) {
  try {
    if (!artifact) throw new Error("Cannot save undefined artifact");
    
    const artifacts = await fetchSavedArtifacts();
    artifacts.push({ 
      ...artifact, 
      documentId: `saved-${Date.now()}` 
    });
    
    localStorage.setItem('savedArtifacts', JSON.stringify(artifacts));
    return true;
  } catch (error) {
    console.error("Failed to save artifact:", error);
    throw error; // Re-throw to handle in the UI
  }
}

// Safe Artifact Content component to catch rendering errors
function SafeArtifactContent({ artifactDefinition, ...props }) {
  const [hasError, setHasError] = useState(false);
  
  useEffect(() => {
    setHasError(false);
  }, [artifactDefinition]);
  
  if (hasError) {
    return (
      <div className="p-4 bg-red-50 text-red-800 rounded">
        <h3 className="font-bold mb-2">Error displaying artifact content</h3>
        <p>There was a problem rendering this content. Try refreshing the page or contact support.</p>
      </div>
    );
  }
  
  try {
    return artifactDefinition.content({ ...props });
  } catch (error) {
    console.error("Error rendering artifact content:", error);
    setHasError(true);
    return null;
  }
}

function PureArtifact({
  chatId,
  input,
  setInput,
  handleSubmit,
  isLoading,
  stop,
  attachments,
  setAttachments,
  append,
  messages,
  setMessages,
  reload,
  votes,
  isReadonly,
}: {
  chatId: string;
  input: string;
  setInput: (input: string) => void;
  isLoading: boolean;
  stop: () => void;
  attachments: Array<Attachment>;
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  messages: Array<Message>;
  setMessages: Dispatch<SetStateAction<Array<Message>>>;
  votes: Array<Vote> | undefined;
  append: (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  handleSubmit: (
    event?: { preventDefault?: () => void },
    chatRequestOptions?: ChatRequestOptions,
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
}) {
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();
  const { mutate } = useSWRConfig();
  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Array<Document>>(
    artifact.documentId !== 'init' && artifact.status !== 'streaming'
      ? `/api/document?id=${artifact.documentId}`
      : null,
    fetcher,
  );

  const [mode, setMode] = useState<'edit' | 'diff'>('edit');
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [savedArtifacts, setSavedArtifacts] = useState<UIArtifact[]>([]);

  const { open: isSidebarOpen } = useSidebar();

  useEffect(() => {
    fetchSavedArtifacts().then(setSavedArtifacts).catch(err => {
      console.error("Failed to load saved artifacts:", err);
      setSavedArtifacts([]);
    });
  }, []);

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.role === 'assistant' && artifact.isVisible) {
      try {
        // Only try parsing if content is a string
        if (typeof latestMessage.content === 'string') {
          const content = JSON.parse(latestMessage.content);
          if (Array.isArray(content)) {
            const kind = Array.isArray(content[0]) ? 'table' : 'chart';
            setArtifact({
              ...artifact,
              kind,
              content: latestMessage.content,
              title: kind === 'table' ? 'Table Artifact' : 'Chart Artifact',
            });
          }
        }
      } catch (e) {
        // Silent catch - content isn't JSON parseable
        console.debug("Not a parseable JSON artifact:", e);
      }
    }
  }, [messages, artifact, setArtifact]);

  useEffect(() => {
    if (documents?.length > 0) {
      const mostRecentDocument = documents.at(-1);
      if (mostRecentDocument) {
        setDocument(mostRecentDocument);
        setCurrentVersionIndex(documents.length - 1);
        setArtifact((current) => ({
          ...current,
          content: mostRecentDocument.content ?? '',
        }));
      }
    }
  }, [documents, setArtifact]);

  useEffect(() => {
    mutateDocuments();
  }, [artifact.status, mutateDocuments]);

  const [isContentDirty, setIsContentDirty] = useState(false);

  const handleContentChange = useCallback(
    (updatedContent: string) => {
      if (!artifact || !artifact.documentId) return;

      mutate<Array<Document>>(
        `/api/document?id=${artifact.documentId}`,
        async (currentDocuments) => {
          if (!currentDocuments?.length) return undefined;

          const currentDocument = currentDocuments.at(-1);
          if (!currentDocument || !currentDocument.content) {
            setIsContentDirty(false);
            return currentDocuments;
          }

          if (currentDocument.content !== updatedContent) {
            try {
              await fetch(`/api/document?id=${artifact.documentId}`, {
                method: 'POST',
                body: JSON.stringify({
                  title: artifact.title,
                  content: updatedContent,
                  kind: artifact.kind,
                }),
              });

              setIsContentDirty(false);

              const newDocument = {
                ...currentDocument,
                content: updatedContent,
                createdAt: new Date(),
              };

              return [...currentDocuments, newDocument];
            } catch (error) {
              console.error("Failed to save document:", error);
              setIsContentDirty(false);
              return currentDocuments;
            }
          }
          return currentDocuments;
        },
        { revalidate: false },
      );
    },
    [artifact, mutate],
  );

  const debouncedHandleContentChange = useDebounceCallback(
    handleContentChange,
    2000,
  );

  const saveContent = useCallback(
    (updatedContent: string, debounce: boolean) => {
      if (document && updatedContent !== document.content) {
        setIsContentDirty(true);
        if (debounce) {
          debouncedHandleContentChange(updatedContent);
        } else {
          handleContentChange(updatedContent);
        }
      }
    },
    [document, debouncedHandleContentChange, handleContentChange],
  );

  function getDocumentContentById(index: number) {
    if (!documents) return '';
    if (index < 0 || index >= documents.length) return '';
    return documents[index]?.content ?? '';
  }

  const handleVersionChange = (type: 'next' | 'prev' | 'toggle' | 'latest') => {
    if (!documents) return;

    if (type === 'latest') {
      setCurrentVersionIndex(documents.length - 1);
      setMode('edit');
    } else if (type === 'toggle') {
      setMode((mode) => (mode === 'edit' ? 'diff' : 'edit'));
    } else if (type === 'prev' && currentVersionIndex > 0) {
      setCurrentVersionIndex((index) => index - 1);
    } else if (type === 'next' && currentVersionIndex < documents.length - 1) {
      setCurrentVersionIndex((index) => index + 1);
    }
  };

  const [isToolbarVisible, setIsToolbarVisible] = useState(false);
  const isCurrentVersion =
    documents && documents.length > 0
      ? currentVersionIndex === documents.length - 1
      : true;

  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const isMobile = windowWidth ? windowWidth < 768 : false;

  const artifactDefinition = artifactDefinitions.find(
    (def) => def.kind === artifact.kind,
  );

  if (!artifactDefinition) {
    console.error(`Artifact definition not found for kind: ${artifact.kind}`);
    // Return an error component instead of throwing
    return (
      <AnimatePresence>
        {artifact.isVisible && (
          <motion.div className="fixed top-4 right-4 bg-red-100 text-red-800 p-4 rounded-lg shadow-lg">
            Error: Unknown artifact type '{artifact.kind}'. Please refresh the page.
            <button 
              className="ml-2 bg-red-200 p-1 rounded"
              onClick={() => setArtifact(prev => ({...prev, isVisible: false}))}
            >
              Close
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  useEffect(() => {
    if (artifact.documentId !== 'init' && typeof artifactDefinition.initialize === 'function') {
      try {
        artifactDefinition.initialize({
          documentId: artifact.documentId,
          setMetadata,
        });
      } catch (error) {
        console.error(`Error initializing ${artifact.kind} artifact:`, error);
      }
    }
  }, [artifact.documentId, artifactDefinition, setMetadata]);

  return (
    <AnimatePresence>
      {artifact.isVisible && (
        <motion.div
          className="flex flex-row h-dvh w-dvw fixed top-0 left-0 z-50 bg-transparent"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { delay: 0.4 } }}
        >
          {!isMobile && (
            <motion.div
              className="fixed bg-background h-dvh"
              initial={{
                width: isSidebarOpen ? windowWidth - 256 : windowWidth,
                right: 0,
              }}
              animate={{ width: windowWidth, right: 0 }}
              exit={{
                width: isSidebarOpen ? windowWidth - 256 : windowWidth,
                right: 0,
              }}
            />
          )}

          {!isMobile && (
            <motion.div
              className="relative w-[400px] bg-muted dark:bg-background h-dvh shrink-0"
              initial={{ opacity: 0, x: 10, scale: 1 }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
                transition: {
                  delay: 0.2,
                  type: 'spring',
                  stiffness: 200,
                  damping: 30,
                },
              }}
              exit={{ opacity: 0, x: 0, scale: 1, transition: { duration: 0 } }}
            >
              <AnimatePresence>
                {!isCurrentVersion && (
                  <motion.div
                    className="left-0 absolute h-dvh w-[400px] top-0 bg-zinc-900/50 z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                )}
              </AnimatePresence>

              <div className="flex flex-col h-full justify-between items-center gap-4">
                <ArtifactMessages
                  chatId={chatId}
                  isLoading={isLoading}
                  votes={votes}
                  messages={messages}
                  setMessages={setMessages}
                  reload={reload}
                  isReadonly={isReadonly}
                  artifactStatus={artifact.status}
                />

                <form className="flex flex-row gap-2 relative items-end w-full px-4 pb-4">
                  <MultimodalInput
                    chatId={chatId}
                    input={input}
                    setInput={setInput}
                    handleSubmit={handleSubmit}
                    isLoading={isLoading}
                    stop={stop}
                    attachments={attachments}
                    setAttachments={setAttachments}
                    messages={messages}
                    append={append}
                    className="bg-background dark:bg-muted"
                    setMessages={setMessages}
                  />
                </form>
              </div>
            </motion.div>
          )}

          <motion.div
            className="fixed bg-white dark:bg-gray-800 h-dvh flex flex-col overflow-y-scroll md:border-l border-gray-200 dark:border-gray-700 shadow-lg"
            initial={
              isMobile
                ? {
                    opacity: 1,
                    x: artifact.boundingBox.left,
                    y: artifact.boundingBox.top,
                    height: artifact.boundingBox.height,
                    width: artifact.boundingBox.width,
                    borderRadius: 12,
                  }
                : {
                    opacity: 1,
                    x: artifact.boundingBox.left,
                    y: artifact.boundingBox.top,
                    height: artifact.boundingBox.height,
                    width: artifact.boundingBox.width,
                    borderRadius: 12,
                  }
            }
            animate={
              isMobile
                ? {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    height: windowHeight,
                    width: windowWidth || '100dvw',
                    borderRadius: 0,
                    transition: {
                      delay: 0,
                      type: 'spring',
                      stiffness: 200,
                      damping: 30,
                    },
                  }
                : {
                    opacity: 1,
                    x: 400,
                    y: 0,
                    height: windowHeight,
                    width: windowWidth ? windowWidth - 400 : 'calc(100dvw - 400px)',
                    borderRadius: 0,
                    transition: {
                      delay: 0,
                      type: 'spring',
                      stiffness: 200,
                      damping: 30,
                    },
                  }
            }
            exit={{
              opacity: 0,
              scale: 0.5,
              transition: { delay: 0.1, type: 'spring', stiffness: 600, damping: 30 },
            }}
          >
            <div className="p-4 flex flex-row justify-between items-start bg-gray-50 dark:bg-gray-900">
              <div className="flex flex-row gap-4 items-start">
                <ArtifactCloseButton />
                <div className="flex flex-col">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{artifact.title}</div>
                  {isContentDirty ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">Saving changes...</div>
                  ) : document ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {`Updated ${formatDistance(new Date(document.createdAt), new Date(), { addSuffix: true })}`}
                    </div>
                  ) : (
                    <div className="w-32 h-3 mt-2 bg-gray-200 dark:bg-gray-600 rounded-md animate-pulse" />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {savedArtifacts.length > 0 && (
                  <select
                    className="p-1 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    onChange={(e) => {
                      const selected = savedArtifacts[Number(e.target.value)];
                      if (selected) {
                        setArtifact({ ...artifact, ...selected });
                      }
                    }}
                  >
                    <option value="">Load Saved</option>
                    {savedArtifacts.map((art, idx) => (
                      <option key={idx} value={idx}>
                        {art.title} ({art.kind})
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                  onClick={() => {
                    try {
                      saveNewArtifact(artifact);
                      // If you have a toast library
                      // toast.success("Artifact saved successfully");
                    } catch (error) {
                      console.error("Failed to save artifact:", error);
                      // If you have a toast library
                      // toast.error("Failed to save artifact");
                    }
                  }}
                >
                  Save
                </button>
                <ArtifactActions
                  artifact={artifact}
                  currentVersionIndex={currentVersionIndex}
                  handleVersionChange={handleVersionChange}
                  isCurrentVersion={isCurrentVersion}
                  mode={mode}
                  metadata={metadata}
                  setMetadata={setMetadata}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-white dark:bg-gray-800">
              <SafeArtifactContent
                artifactDefinition={artifactDefinition}
                title={artifact.title}
                content={
                  isCurrentVersion
                    ? artifact.content
                    : getDocumentContentById(currentVersionIndex)
                }
                mode={mode}
                status={artifact.status}
                currentVersionIndex={currentVersionIndex}
                suggestions={[]}
                onSaveContent={saveContent}
                isInline={false}
                isCurrentVersion={isCurrentVersion}
                getDocumentContentById={getDocumentContentById}
                isLoading={isDocumentsFetching && !artifact.content}
                metadata={metadata}
                setMetadata={setMetadata}
              />
            </div>

            <AnimatePresence>
              {isCurrentVersion && (
                <Toolbar
                  isToolbarVisible={isToolbarVisible}
                  setIsToolbarVisible={setIsToolbarVisible}
                  append={append}
                  isLoading={isLoading}
                  stop={stop}
                  setMessages={setMessages}
                  artifactKind={artifact.kind}
                />
              )}
              {!isCurrentVersion && (
                <VersionFooter
                  currentVersionIndex={currentVersionIndex}
                  documents={documents}
                  handleVersionChange={handleVersionChange}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const Artifact = memo(PureArtifact, (prevProps, nextProps) => {
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (!equal(prevProps.votes, nextProps.votes)) return false;
  if (prevProps.input !== nextProps.input) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;
  return true;
});
