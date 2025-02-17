import React, { memo } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as Separator from '@radix-ui/react-separator';
import { ArrowUpRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const components: Partial<Components> = {
  // Updated link component with bordered style
  a: ({ children, href }) => (
    <a
      href={href || '#'}
      className="inline-flex items-center gap-1.5 text-primary hover:text-primary/90 border border-primary/20 hover:border-primary/40 px-2 py-0.5 rounded-md transition-colors"
      target="_blank"
      rel="noreferrer"
    >
      <span>{children}</span>
      <ArrowUpRight className="h-3 w-3" />
    </a>
  ),

  // Rest of your existing components...
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

  // Keep your other existing components the same...
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
