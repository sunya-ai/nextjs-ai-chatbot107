'use client';

import React, { memo, type FC } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as Separator from '@radix-ui/react-separator';
import { ArrowUpRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const components: Partial<Components> = {
  // Example link override
  a: ({ children, href }) => (
    <a
      href={href || '#'}
      className="inline-flex items-center gap-1.5 text-primary hover:text-primary/90 
                 border border-primary/20 hover:border-primary/40 px-2 py-0.5 rounded-md 
                 transition-colors"
      target="_blank"
      rel="noreferrer"
    >
      <span>{children}</span>
      <ArrowUpRight className="h-3 w-3" />
    </a>
  ),

  // Higher-contrast code block with vertical scrolling
  code: ({ className, children }) => {
    // If there's a "language-xxx" class, extract the language name
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';

    // Render a block code snippet if we found a language
    if (language) {
      return (
        <div className="my-6 rounded-lg border bg-muted">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-foreground" />
              <span className="text-xs font-medium text-foreground">
                {language.toUpperCase()}
              </span>
            </div>
          </div>
          {/* Use `overflow-auto` + `max-h-96` to prevent text from being cut off */}
          <pre className="overflow-auto p-4 max-h-96">
            <code className={className}>{children}</code>
          </pre>
        </div>
      );
    }

    // Otherwise, render inline code with normal contrast
    return (
      <code className="rounded-md bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm text-foreground">
        {children}
      </code>
    );
  },

  // Example horizontal rule
  hr: () => <Separator.Root className="my-8 h-[1px] bg-border" />,

  // ... (other overrides such as blockquote, p, etc., if needed)
};

const remarkPlugins = [remarkGfm];

interface MarkdownProps {
  children: string;
  className?: string;
}

const NonMemoizedMarkdown: FC<MarkdownProps> = ({ children, className = '' }) => {
  return (
    // Removed the "prose" classes so user messages aren’t faded
    <div className={cn(className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
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
