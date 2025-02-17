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
      <code className="rounded-md bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
        {children}
      </code>
    );
  },

  // Main heading with date
  h1: ({ children }) => (
    <div className="mb-8">
      <h1 className="scroll-m-20 text-4xl font-bold tracking-tight lg:text-5xl">
        {children}
      </h1>
      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>Updated January 2025</span>
      </div>
      <Separator.Root className="my-4 h-[1px] bg-border" />
    </div>
  ),

  // Section headings
  h2: ({ children }) => (
    <h2 className="mt-12 scroll-m-20 border-b border-border pb-2 text-2xl font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),

  h3: ({ children }) => (
    <h3 className="mt-8 scroll-m-20 text-xl font-semibold tracking-tight">
      {children}
    </h3>
  ),

  // Enhanced table
  table: ({ children }) => (
    <div className="my-6 w-full overflow-auto rounded-lg border">
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
    <tr className="transition-colors hover:bg-muted/50">
      {children}
    </tr>
  ),

  th: ({ children }) => (
    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {children}
    </th>
  ),

  td: ({ children }) => (
    <td className="px-4 py-3 text-sm">
      {children}
    </td>
  ),

  // Links with icon
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
    <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
      {children}
    </ul>
  ),

  ol: ({ children }) => (
    <ol className="my-6 ml-6 list-decimal [&>li]:mt-2">
      {children}
    </ol>
  ),

  // Blockquotes
  blockquote: ({ children }) => (
    <div className="my-6 rounded-lg border-l-4 border-primary bg-muted/50 px-6 py-4 italic text-muted-foreground">
      {children}
    </div>
  ),

  // Paragraphs
  p: ({ children }) => (
    <p className="leading-7 [&:not(:first-child)]:mt-6">
      {children}
    </p>
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
      "prose-headings:font-sans prose-headings:font-bold",
      "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
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
