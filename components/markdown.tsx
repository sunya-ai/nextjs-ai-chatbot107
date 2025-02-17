'use client';

import React, { memo, type FC } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import * as Separator from '@radix-ui/react-separator';
import {
  ArrowUpRight,
  FileText,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

// Your utility—if you don't need `cn`, just remove/replace it.
import { cn } from '@/lib/utils';

// 1) Import your existing *unmodified* CodeBlock from ./code-block
import { CodeBlock } from './code-block';

/**
 * 2) Create a typed wrapper so `react-markdown` sees the correct <code> signature.
 *    This simply forwards all props to your existing CodeBlock.
 */
const CodeWrapper: Components['code'] = ({
  node,
  inline,
  className,
  children,
  ...props
}) => {
  return (
    <CodeBlock
      node={node}
      inline={inline ?? false}
      className={className ?? ''}
      {...props}
    >
      {children}
    </CodeBlock>
  );
};

// 3) Define custom components for other markdown elements.
//    Exactly as in your original code, but now `code: CodeWrapper`.
const components: Partial<Components> = {
  code: CodeWrapper,

  a: ({ children, href }) => (
    <motion.a
      href={href || '#'}
      whileHover={{ scale: 1.02 }}
      className="inline-flex items-center gap-1.5 text-primary hover:text-primary/90
                 border border-primary/20 hover:border-primary/40 px-2 py-0.5 rounded-md 
                 transition-colors"
      target="_blank"
      rel="noreferrer"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </motion.a>
  ),

  blockquote: ({ children }) => (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="my-6 rounded-lg border-l-4 border-primary/30 bg-muted/30 pl-6 py-4 pr-4"
    >
      <div className="flex gap-3">
        <AlertCircle className="h-5 w-5 text-primary/60 flex-shrink-0 mt-1" />
        <blockquote className="italic text-muted-foreground">
          {children}
        </blockquote>
      </div>
    </motion.div>
  ),

  p: ({ children }) => (
    <p className="leading-7 text-foreground [&:not(:first-child)]:mt-6">
      {children}
    </p>
  ),

  strong: ({ children }) => (
    <span className="font-semibold text-foreground">
      {children}
    </span>
  ),

  ul: ({ children }) => (
    <ul className="my-6 ml-6 list-disc marker:text-primary [&>li]:mt-2 text-foreground">
      {children}
    </ul>
  ),

  ol: ({ children }) => (
    <ol className="my-6 ml-6 list-decimal marker:text-primary [&>li]:mt-2 text-foreground">
      {children}
    </ol>
  ),

  table: ({ children }) => (
    <div className="my-6 w-full overflow-hidden rounded-lg border">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full overflow-auto"
      >
        <table className="w-full border-collapse text-sm">
          {children}
        </table>
      </motion.div>
    </div>
  ),

  thead: ({ children }) => (
    <thead className="border-b bg-muted/50">{children}</thead>
  ),

  tbody: ({ children }) => (
    <tbody className="divide-y divide-border">{children}</tbody>
  ),

  tr: ({ children }) => (
    <tr className="transition-colors hover:bg-muted/50">{children}</tr>
  ),

  th: ({ children }) => (
    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {children}
    </th>
  ),

  td: ({ children }) => (
    <td className="px-4 py-3 text-sm text-foreground">{children}</td>
  ),

  hr: () => <Separator.Root className="my-8 h-[1px] bg-border" />,
};

interface MarkdownProps {
  /** The raw Markdown string to render */
  children: string;
  /** Optional extra classnames on the container */
  className?: string;
}

/**
 * 4) Our non-memoized wrapper around ReactMarkdown, applying:
 *    - GFM plugin
 *    - Our custom components
 */
const NonMemoizedMarkdown: FC<MarkdownProps> = ({ children, className = '' }) => {
  return (
    <div
      className={cn(
        'prose prose-stone dark:prose-invert max-w-none',
        'prose-headings:text-foreground',
        'prose-p:text-foreground',
        'prose-strong:text-foreground',
        'prose-ul:text-foreground',
        'prose-ol:text-foreground',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
};

/** 5) Export a memoized version of our Markdown component */
export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className
);

// Helps debugging in React DevTools
Markdown.displayName = 'Markdown';
