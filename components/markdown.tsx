import Link from 'next/link';
import React, { memo } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as Separator from '@radix-ui/react-separator';
import { Calendar, ArrowUpRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const components: Partial<Components> = {
  // Code blocks
  code: ({ className, children }) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    
    if (language) {
      return (
        <div className="my-6 rounded-lg border bg-muted/50">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                {language.toUpperCase()}
              </span>
            </div>
          </div>
          <pre className="overflow-x-auto p-4">
            <code className={className}>{children}</code>
          </pre>
        </div>
      );
    }

    return (
      <code className="rounded-md bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm text-foreground">
        {children}
      </code>
    );
  },

  // Headings
  h1: ({ children }) => (
    <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">
      {children}
    </h1>
  ),

  h2: ({ children }) => (
    <h2 className="mt-10 mb-4 text-2xl font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  ),

  h3: ({ children }) => (
    <h3 className="mt-8 mb-4 text-xl font-semibold tracking-tight text-foreground">
      {children}
    </h3>
  ),

  // Links
  a: ({ children, href }) => (
    <Link
      href={href || '#'}
      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
      target="_blank"
      rel="noreferrer"
    >
      {children}
      <ArrowUpRight className="h-3 w-3" />
    </Link>
  ),

  // Lists
  ul: ({ children }) => (
    <ul className="my-6 ml-6 list-disc [&>li]:mt-2 text-foreground">
      {children}
    </ul>
  ),

  ol: ({ children }) => (
    <ol className="my-6 ml-6 list-decimal [&>li]:mt-2 text-foreground">
      {children}
    </ol>
  ),

  // Table
  table: ({ children }) => (
    <div className="my-6 w-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  ),

  thead: ({ children }) => (
    <thead className="border-b bg-muted/50">
      {children}
    </thead>
  ),

  tbody: ({ children }) => (
    <tbody className="divide-y divide-border">
      {children}
    </tbody>
  ),

  tr: ({ children }) => (
    <tr className="transition-colors hover:bg-muted/50 text-foreground">
      {children}
    </tr>
  ),

  th: ({ children }) => (
    <th className="h-10 px-4 text-left align-middle font-medium text-foreground">
      {children}
    </th>
  ),

  td: ({ children }) => (
    <td className="p-4 align-middle text-foreground">
      {children}
    </td>
  ),

  // Text elements
  p: ({ children }) => (
    <p className="leading-7 [&:not(:first-child)]:mt-6 text-foreground">
      {children}
    </p>
  ),

  strong: ({ children }) => (
    <span className="font-semibold text-foreground">
      {children}
    </span>
  ),

  em: ({ children }) => (
    <em className="italic text-foreground">
      {children}
    </em>
  ),

  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote className="mt-6 border-l-2 border-border pl-6 italic text-foreground">
      {children}
    </blockquote>
  ),

  // Horizontal rule
  hr: () => (
    <Separator.Root className="my-4 h-[1px] bg-border" />
  ),
};

const remarkPlugins = [remarkGfm];

interface MarkdownProps {
  children: string;
  className?: string;
}

const NonMemoizedMarkdown: React.FC<MarkdownProps> = ({ 
  children,
  className = ''
}) => {
  return (
    <div className={cn(
      "prose prose-stone dark:prose-invert max-w-none",
      "prose-headings:text-foreground",
      "prose-p:text-foreground",
      "prose-strong:text-foreground",
      "prose-ul:text-foreground",
      "prose-ol:text-foreground",
      className
    )}>
      <ReactMarkdown 
        remarkPlugins={remarkPlugins} 
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => 
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className
);

Markdown.displayName = 'Markdown';
