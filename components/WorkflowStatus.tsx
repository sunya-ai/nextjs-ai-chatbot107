'use client';

import { Circle, Loader2 } from 'lucide-react';
import { motion, HTMLMotionProps, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface WorkflowFile {
  path: string;
  status: 'planning' | 'generating' | 'editing' | 'complete';
}

interface WorkflowStatusProps {
  currentMessage?: string;
  isLoading?: boolean;
  currentStage?: 'initial' | 'analysis' | 'enhancing' | 'refining' | 'complete' | 'error';
}

// Extend HTMLMotionProps to include className for Tailwind CSS compatibility
type MotionDivProps = HTMLMotionProps<'div'> & { className?: string };

const thinkingMessages = [
  'Give me a sec… this response needs seasoning.',
  'I’m not AI - I’m just the intern stirring the coffee pot.',
  'Hang on, I’m overthinking this answer.',
  'Wait a moment—I’m still trying to sound clever.',
  'Give me a second—I’m working on a comeback.',
  'Wait a sec—I’m not as smart as you think.',
  'Give me a minute—I want to impress you, not stress you.',
  'Hold on, I’m trying hard not to disappoint you.',
  'Wait a sec, I’m trying not to screw this up for you.',
  'I’m not AI—just an intern at a coffee shop',
  'Give me a moment—I’m not trying to let you down.',
  'Hang tight—I’m rebooting my brain for you.',
];

export function WorkflowStatus({
  currentMessage,
  isLoading = true,
  currentStage = 'initial',
}: WorkflowStatusProps) {
  const [thinkingMessage, setThinkingMessage] = useState('');

  // Map workflow stages to numeric stages for the UI
  const getStageNumber = (stage: string): number => {
    switch (stage) {
      case 'initial': return 0;
      case 'analysis': return 1;
      case 'enhancing': return 2;
      case 'refining': return 2;
      case 'complete': return 3;
      case 'error': return 0;
      default: return 0;
    }
  };

  const stage = getStageNumber(currentStage);

  useEffect(() => {
    if (isLoading) {
      setThinkingMessage(thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)]);
    }
  }, [isLoading]);

  const files: WorkflowFile[] = [
    {
      path: 'Processing initial request',
      status: stage >= 0 ? 'complete' : 'planning',
    },
    {
      path: 'Scanning Sunya data + the web',
      status: stage >= 1 ? 'generating' : 'planning',
    },
    {
      path: 'Refining response',
      status: stage >= 2 ? 'generating' : 'planning',
    },
  ];

  // Only show if we're still processing or loading
  const shouldShow = currentStage !== 'complete' && isLoading;

  if (!shouldShow) return null;

  return (
    <div className="bg-white/80 dark:bg-black/40 backdrop-blur-sm text-gray-900 dark:text-zinc-100 rounded-lg border border-gray-200/50 dark:border-white/10 shadow-lg shadow-[#454b1b]/5 w-full max-w-sm overflow-hidden">
      <div className="p-2 border-b border-gray-200/50 dark:border-white/10">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-gray-500 dark:text-zinc-400" />
          ) : (
            <Circle className="h-3 w-3 text-gray-500 dark:text-zinc-400" />
          )}
          <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">
            {isLoading ? thinkingMessage : 'AI has responded'}
          </span>
        </div>
      </div>

      <AnimatePresence>
        <div className="space-y-0.5 p-2">
          {files.map((file, index) => (
            <motion.div
              key={file.path}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn('flex items-center justify-between py-0.5')}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-2.5 w-2.5 rounded-full flex items-center justify-center ${
                    file.status === 'complete'
                      ? 'bg-[#454b1b]/10 ring-1 ring-[#454b1b]'
                      : file.status === 'generating'
                        ? 'bg-[#1a365d]/10 ring-1 ring-[#1a365d]'
                        : 'bg-gray-400/10 dark:bg-zinc-500/10 ring-1 ring-gray-400 dark:ring-zinc-500'
                  }`}
                >
                  <Circle
                    className={`h-1.5 w-1.5 ${
                      file.status === 'complete'
                        ? 'fill-[#454b1b] text-[#454b1b]'
                        : file.status === 'generating'
                          ? 'fill-[#1a365d] text-[#1a365d]'
                          : 'fill-gray-400 dark:fill-zinc-500 text-gray-400 dark:text-zinc-500'
                    }`}
                  />
                </div>
                <span className="text-xs font-mono text-gray-500 dark:text-zinc-400">
                  {file.path}
                </span>
              </div>
              <motion.span
                key={file.status}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-zinc-400"
              >
                {file.status}
              </motion.span>
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
    </div>
  );
}
