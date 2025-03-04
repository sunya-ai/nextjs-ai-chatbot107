'use client';

import type {
  Attachment,
  ChatRequestOptions,
  CreateMessage,
  Message,
  DataStreamWriter,
} from 'ai';
import { formatDistance } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import React, {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
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
import equal from 'fast-deep-equal';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';
import axios from 'axios';
import * as Papa from 'papaparse';
import { CustomMessage } from '@/lib/types';
import { DataStreamDelta } from './data-stream-handler'; // Added import for DataStreamDelta

// Type guard function to check if a message is a CustomMessage
function isCustomMessage(message: Message | CustomMessage): message is CustomMessage {
  return 'chatId' in message;
}

// Helper function to convert Message to CustomMessage
function toCustomMessage(msg: Message, chatId: string): CustomMessage {
  return {
    ...msg,
    chatId,
    sources: (msg as Partial<CustomMessage>).sources || undefined,
    metadata: (msg as Partial<CustomMessage>).metadata || undefined,
    reasoning: msg.reasoning,
  };
}

// Helper function to convert CustomMessage to Message
function toMessage(msg: CustomMessage): Message {
  let reasoningValue: string | undefined = undefined;
  
  if (msg.reasoning) {
    if (Array.isArray(msg.reasoning) && msg.reasoning.length > 0) {
      reasoningValue = msg.reasoning[0];
    } else if (typeof msg.reasoning === 'string') {
      reasoningValue = msg.reasoning;
    }
  }
  
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
    reasoning: reasoningValue
  };
}

export type ArtifactKind = 'text' | 'code' | 'image' | 'sheet' | 'table' | 'chart';

export interface ArtifactAction {
  icon: React.ReactNode;
  label?: string;
  description: string;
  onClick: (context: {
    content: any;
    handleVersionChange: (type: 'next' | 'prev' | 'toggle' | 'latest') => void;
    currentVersionIndex: number;
    isCurrentVersion: boolean;
    mode: 'edit' | 'diff';
    metadata: any;
    setMetadata: Dispatch<SetStateAction<any>>;
  }) => Promise<void> | void;
  isDisabled?: (context: {
    content: any;
    handleVersionChange: (type: 'next' | 'prev' | 'toggle' | 'latest') => void;
    currentVersionIndex: number;
    isCurrentVersion: boolean;
    mode: 'edit' | 'diff';
    metadata: any;
    setMetadata: Dispatch<SetStateAction<any>>;
  }) => boolean;
}

export interface ArtifactContentProps {
  title: string;
  content: string;
  mode: 'edit' | 'diff';
  status: 'streaming' | 'idle';
  currentVersionIndex: number;
  suggestions: any[];
  onSaveContent: (content: string, debounce: boolean) => void;
  isInline: boolean;
  isCurrentVersion: boolean;
  getDocumentContentById: (index: number) => string;
  isLoading: boolean;
  metadata: any;
  setMetadata: Dispatch<SetStateAction<any>>;
}

export interface ArtifactDefinition {
  kind: ArtifactKind;
  actions: ArtifactAction[];
  content: ComponentType<any>;
  initialize?: (options: { documentId: string; setMetadata: Dispatch<SetStateAction<any>> }) => void;
  toolbar?: any[];
  onStreamPart?: (params: {
    streamPart: DataStreamDelta;
    setArtifact: Dispatch<SetStateAction<UIArtifact>>;
    setMetadata: Dispatch<SetStateAction<any>>;
  }) => void; // Added onStreamPart property
}

export const artifactDefinitions: ArtifactDefinition[] = [
  textArtifact as ArtifactDefinition,
  codeArtifact as ArtifactDefinition,
  imageArtifact as ArtifactDefinition,
  sheetArtifact as ArtifactDefinition,
];

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

interface ArtifactProps {
  chatId: string;
  input: string;
  setInput: (input: string) => void;
  handleSubmit: (
    event?: {
      preventDefault?: () => void;
    },
    chatRequestOptions?: ChatRequestOptions,
  ) => void;
  isLoading: boolean;
  stop: () => void;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  messages: CustomMessage[];
  setMessages: (messagesOrUpdater: CustomMessage[] | ((prev: CustomMessage[]) => CustomMessage[])) => void;
  append: (
    message: CustomMessage | CreateMessage,
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  reload: (chatRequestOptions?: ChatRequestOptions) => Promise<string | null | undefined>;
  votes: Vote[] | undefined;
  dataStream?: DataStreamWriter;
  isReadonly: boolean;
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
  dataStream,
  isReadonly,
}: ArtifactProps) {
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();

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
  const [showChart, setShowChart] = useState(false);
  const [showLogos, setShowLogos] = useState(false);
  const [progress, setProgress] = useState<string>('');

  const { open: isSidebarOpen } = useSidebar();

  useEffect(() => {
    if (documents && documents.length > 0) {
      const mostRecentDocument = documents.at(-1);

      if (mostRecentDocument) {
        setDocument(mostRecentDocument);
        setCurrentVersionIndex(documents.length - 1);
        setArtifact((currentArtifact) => ({
          ...currentArtifact,
          content: mostRecentDocument.content ?? '',
        }));
      }
    }
  }, [documents, setArtifact]);

  useEffect(() => {
    mutateDocuments();
  }, [artifact.status, mutateDocuments]);

  const { mutate } = useSWRConfig();
  const [isContentDirty, setIsContentDirty] = useState(false);

  const handleContentChange = useCallback(
    (updatedContent: string) => {
      if (!artifact) return;

      mutate<Array<Document>>(
        `/api/document?id=${artifact.documentId}`,
        async (currentDocuments) => {
          if (!currentDocuments) return undefined;

          const currentDocument = currentDocuments.at(-1);

          if (!currentDocument || !currentDocument.content) {
            setIsContentDirty(false);
            return currentDocuments;
          }

          if (currentDocument.content !== updatedContent) {
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
    if (!documents[index]) return '';
    return documents[index].content ?? '';
  }

  const handleVersionChange = (type: 'next' | 'prev' | 'toggle' | 'latest') => {
    if (!documents) return;

    if (type === 'latest') {
      setCurrentVersionIndex(documents.length - 1);
      setMode('edit');
    }

    if (type === 'toggle') {
      setMode((mode) => (mode === 'edit' ? 'diff' : 'edit'));
    }

    if (type === 'prev') {
      if (currentVersionIndex > 0) {
        setCurrentVersionIndex((index) => index - 1);
      }
    } else if (type === 'next') {
      if (currentVersionIndex < documents.length - 1) {
        setCurrentVersionIndex((index) => index + 1);
      }
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
    (definition) => definition.kind === artifact.kind,
  );

  if (!artifactDefinition) {
    throw new Error('Artifact definition not found!');
  }

  useEffect(() => {
    if (artifact.documentId !== 'init') {
      if (artifactDefinition.initialize) {
        artifactDefinition.initialize({
          documentId: artifact.documentId,
          setMetadata,
        });
      }
    }
  }, [artifact.documentId, artifactDefinition, setMetadata]);

  const parseSpreadsheetData = useCallback((csvContent: string) => {
    const parsed = Papa.parse<string[]>(csvContent, { skipEmptyLines: true, header: true });
    return parsed.data.map(row => ({
      name: row[0] || 'Unknown',
      value: parseFloat(row[1] || '0'),
    })).filter(row => row.name && !isNaN(row.value));
  }, []);

  const chartData = useMemo(() => {
    if (artifact.kind === 'sheet' && artifact.content) {
      return parseSpreadsheetData(artifact.content);
    }
    return [];
  }, [artifact.kind, artifact.content, parseSpreadsheetData]);

  const fetchLogo = async (company: string) => {
    try {
      const domain = company.toLowerCase().replace(/\s+/g, '') + '.com';
      const response = await axios.get(`https://logo.clearbit.com/${domain}`, { responseType: 'blob' });
      return URL.createObjectURL(response.data);
    } catch (error) {
      console.error('[artifact] Failed to fetch logo for', company, ':', error);
      return '/default-logo.png';
    }
  };

  const [logoMap, setLogoMap] = useState<{ [key: string]: string | null }>({});
  const loadLogos = useCallback(async () => {
    if (artifact.kind === 'sheet' && artifact.content && !showLogos) {
      const data = parseSpreadsheetData(artifact.content);
      const newLogos = { ...logoMap };
      for (const row of data) {
        if (!newLogos[row.name] && row.name) {
          newLogos[row.name] = await fetchLogo(row.name);
        }
      }
      setLogoMap(newLogos);
      setShowLogos(true);
      console.log('[artifact] Logos loaded for spreadsheet, count:', Object.keys(newLogos).length);
    }
  }, [artifact.kind, artifact.content, showLogos, logoMap, parseSpreadsheetData]);

  const chartWithLogos = useMemo(() => {
    if (!showLogos || !chartData.length) return chartData;
    return chartData.map(row => ({
      ...row,
      logo: logoMap[row.name] || null,
    }));
  }, [showLogos, chartData, logoMap]);

  useEffect(() => {
    if (artifact.status === 'streaming' && (artifact.kind === 'sheet' || artifact.kind === 'chart')) {
      const totalRows = chartData.length || 1;
      for (let i = 0; i < totalRows; i++) {
        setProgress(`Processing row ${i + 1} of ${totalRows}`);
      }
      setTimeout(() => {
        setProgress('Processing complete');
      }, totalRows * 50);
    }
  }, [artifact.status, artifact.kind, chartData.length]);

  const handleChartEdit = useCallback((newConfig: any) => {
    setMetadata((prev: any) => ({ ...prev, chartConfig: newConfig }));
    console.log('[artifact] Chart updated with new config:', JSON.stringify(newConfig));
    fetch(`/api/document?id=${artifact.documentId}`, {
      method: 'POST',
      body: JSON.stringify({
        title: artifact.title,
        content: JSON.stringify({ ...chartData, ...newConfig }),
        kind: 'chart',
      }),
    }).then(() => console.log('[artifact] Chart update sent to server'));
  }, [artifact.documentId, artifact.title, chartData, setMetadata]);

  const contentProps = {
    title: artifact.title,
    content: isCurrentVersion
      ? artifact.content
      : getDocumentContentById(currentVersionIndex),
    mode,
    status: artifact.status,
    currentVersionIndex,
    suggestions: [],
    onSaveContent: saveContent,
    isInline: false,
    isCurrentVersion,
    getDocumentContentById,
    isLoading: isDocumentsFetching && !artifact.content,
    metadata,
    setMetadata,
  };

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
              exit={{
                opacity: 0,
                x: 0,
                scale: 1,
                transition: { duration: 0 },
              }}
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
                  setMessages={(messagesOrUpdater) => {
                    if (typeof messagesOrUpdater === 'function') {
                      setMessages((prevCustomMessages) => {
                        const prevAsMessages = prevCustomMessages.map(toMessage);
                        const prevAsCustomMessages = prevAsMessages.map(m => toCustomMessage(m, chatId));
                        const updatedMessages = messagesOrUpdater(prevAsCustomMessages) as CustomMessage[];
                        return updatedMessages;
                      });
                    } else {
                      setMessages(messagesOrUpdater as CustomMessage[]);
                    }
                  }}
                  reload={reload}
                  isReadonly={isReadonly}
                  artifactStatus={artifact.status}
                  progress={progress}
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
                    messages={messages.map(toMessage)}
                    append={append}
                    setMessages={(messagesOrUpdater) => {
                      if (typeof messagesOrUpdater === 'function') {
                        setMessages((prevCustomMessages) => {
                          const prevAsMessages = prevCustomMessages.map(toMessage);
                          const updatedMessages = messagesOrUpdater(prevAsMessages) as Message[];
                          return updatedMessages.map(m => isCustomMessage(m) ? m : toCustomMessage(m, chatId));
                        });
                      } else {
                        setMessages(messagesOrUpdater.map(m => 
                          isCustomMessage(m) ? m : toCustomMessage(m, chatId)
                        ) as CustomMessage[]);
                      }
                    }}
                  />
                </form>
              </div>
            </motion.div>
          )}

          <motion.div
            className="fixed dark:bg-muted bg-background h-dvh flex flex-col overflow-y-scroll md:border-l dark:border-zinc-700 border-zinc-200"
            initial={
              isMobile
                ? {
                    opacity: 1,
                    x: artifact.boundingBox.left,
                    y: artifact.boundingBox.top,
                    height: artifact.boundingBox.height,
                    width: artifact.boundingBox.width,
                    borderRadius: 50,
                  }
                : {
                    opacity: 1,
                    x: artifact.boundingBox.left,
                    y: artifact.boundingBox.top,
                    height: artifact.boundingBox.height,
                    width: artifact.boundingBox.width,
                    borderRadius: 50,
                  }
            }
            animate={
              isMobile
                ? {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    height: windowHeight,
                    width: windowWidth ? windowWidth : 'calc(100dvw)',
                    borderRadius: 0,
                    transition: {
                      delay: 0,
                      type: 'spring',
                      stiffness: 200,
                      damping: 30,
                      duration: 5000,
                    },
                  }
                : {
                    opacity: 1,
                    x: 400,
                    y: 0,
                    height: windowHeight,
                    width: windowWidth
                      ? windowWidth - 400
                      : 'calc(100dvw-400px)',
                    borderRadius: 0,
                    transition: {
                      delay: 0,
                      type: 'spring',
                      stiffness: 200,
                      damping: 30,
                      duration: 5000,
                    },
                  }
            }
            exit={{
              opacity: 0,
              scale: 0.5,
              transition: {
                delay: 0.1,
                type: 'spring',
                stiffness: 600,
                damping: 30,
              },
            }}
          >
            <div className="p-2 flex flex-row justify-between items-start">
              <div className="flex flex-row gap-4 items-start">
                <ArtifactCloseButton />

                <div className="flex flex-col">
                  <div className="font-medium">{artifact.title}</div>

                  {isContentDirty ? (
                    <div className="text-sm text-muted-foreground">
                      Saving changes...
                    </div>
                  ) : document ? (
                    <div className="text-sm text-muted-foreground">
                      {`Updated ${formatDistance(
                        new Date(document.createdAt),
                        new Date(),
                        {
                          addSuffix: true,
                        },
                      )}`}
                    </div>
                  ) : (
                    <div className="w-32 h-3 mt-2 bg-muted-foreground/20 rounded-md animate-pulse" />
                  )}
                </div>
              </div>

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

            <div className="dark:bg-muted bg-background h-full overflow-y-scroll !max-w-full items-center">
              {React.createElement(artifactDefinition.content, contentProps)}

              <AnimatePresence>
                {isCurrentVersion && artifact.kind === 'sheet' && (
                  <Toolbar
                    isToolbarVisible={isToolbarVisible}
                    setIsToolbarVisible={setIsToolbarVisible}
                    append={append}
                    isLoading={isLoading}
                    stop={stop}
                    setMessages={(messagesOrUpdater) => {
                      if (typeof messagesOrUpdater === 'function') {
                        setMessages((prevCustomMessages) => {
                          const prevAsMessages = prevCustomMessages.map(toMessage);
                          const updatedMessages = messagesOrUpdater(prevAsMessages) as Message[];
                          return updatedMessages.map(m => isCustomMessage(m) ? m : toCustomMessage(m, chatId));
                        });
                      } else {
                        setMessages(messagesOrUpdater.map(m => 
                          isCustomMessage(m) ? m : toCustomMessage(m, chatId)
                        ) as CustomMessage[]);
                      }
                    }}
                    artifactKind={artifact.kind}
                    onGenerateChart={() => setShowChart(true)}
                    onAddLogos={() => loadLogos()}
                  />
                )}
              </AnimatePresence>

              {showChart && artifact.kind === 'sheet' && chartWithLogos.length > 0 && (
                <div className="p-4 bg-background dark:bg-muted">
                  <button
                    onClick={() => setShowChart(false)}
                    className="mb-2 bg-red-500 text-white px-2 py-1 rounded"
                  >
                    Hide Chart
                  </button>
                  <BarChart width={600} height={300} data={chartWithLogos}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      type="category"
                      tick={(props) => {
                        const { x, y, payload } = props;
                        const logo = logoMap[payload.value] || null;
                        return logo ? (
                          <g transform={`translate(${x},${y})`}>
                            <image 
                              x={-10} 
                              y={-20} 
                              width={20} 
                              height={20} 
                              href={logo} 
                              preserveAspectRatio="xMidYMid slice"
                            />
                          </g>
                        ) : (
                          <text x={x} y={y} dy={16} textAnchor="middle" fill="#666">
                            {payload.value}
                          </text>
                        );
                      }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" fill="#8884d8">
                      {chartWithLogos.map((entry, index) => (
                        <Cell key={`cell-${index}`} />
                      ))}
                    </Bar>
                  </BarChart>
                  <button
                    onClick={() => handleChartEdit({ type: 'bar' })}
                    className="mt-2 bg-blue-500 text-white px-2 py-1 rounded"
                  >
                    Edit Chart
                  </button>
                </div>
              )}
            </div>

            <AnimatePresence>
              {!isCurrentVersion && (
                <VersionFooter
                  currentVersionIndex={currentVersionIndex}
                  documents={documents}
                  handleVersionChange={handleVersionChange}
                  className="bg-background dark:bg-muted border-t dark:border-zinc-700"
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
