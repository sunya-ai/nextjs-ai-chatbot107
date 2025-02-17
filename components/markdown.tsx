import React, { memo } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import * as Separator from '@radix-ui/react-separator';
import * as Tooltip from '@radix-ui/react-tooltip';
import { 
  ArrowUpRight, 
  FileText, 
  Copy, 
  Check,
  AlertCircle,
  ExternalLink,
  Info,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

const components: Partial<Components> = {
  // Enhanced code blocks with copy functionality
  code: ({ className, children }) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const [copied, setCopied] = React.useState(false);
    
    const copyToClipboard = () => {
      if (typeof children === 'string') {
        navigator.clipboard.writeText(children);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    };
    
    if (language) {
      return (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-6 rounded-lg border bg-muted/50 overflow-hidden"
        >
          <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/70">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                {language.toUpperCase()}
              </span>
            </div>
            <Tooltip.Provider delayDuration={0}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={copyToClipboard}
                    className="p-1.5 hover:bg-muted rounded-md transition-colors"
                  >
                    {copied ? 
                      <Check className="h-4 w-4 text-green-500" /> : 
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    }
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
                  >
                    {copied ? 'Copied!' : 'Copy code'}
                    <Tooltip.Arrow className="fill-popover" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>
          <pre className="overflow-x-auto p-4">
            <code className={className}>{children}</code>
          </pre>
        </motion.div>
      );
    }

    return (
      <code className="rounded-md bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm text-foreground">
        {children}
      </code>
    );
  },

  // Animated links with info tooltip
  a: ({ children, href, title }) => (
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <motion.a
            href={href || '#'}
            whileHover={{ scale: 1.02 }}
            className="inline-flex items-center gap-1.5 text-primary hover:text-primary/90 border border-primary/20 hover:border-primary/40 px-2 py-0.5 rounded-md transition-colors"
            target="_blank"
            rel="noreferrer"
          >
            <span>{children}</span>
            <ExternalLink className="h-3 w-3" />
          </motion.a>
        </Tooltip.Trigger>
        {title && (
          <Tooltip.Portal>
            <Tooltip.Content
              className="flex items-center gap-1.5 rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
            >
              <Info className="h-4 w-4" />
              {title}
              <Tooltip.Arrow className="fill-popover" />
            </Tooltip.Content>
          </Tooltip.Portal>
        )}
      </Tooltip.Root>
    </Tooltip.Provider>
  ),

  // Enhanced headings
  h1: ({ children }) => (
    <motion.h1 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="scroll-m-20 text-4xl font-bold tracking-tight text-foreground lg:text-5xl mb-8"
    >
      {children}
    </motion.h1>
  ),

  h2: ({ children }) => (
    <motion.h2 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight text-foreground first:mt-0 mt-10 mb-4"
    >
      {children}
    </motion.h2>
  ),

  h3: ({ children }) => (
    <motion.h3 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="scroll-m-20 text-2xl font-semibold tracking-tight text-foreground mt-8 mb-4"
    >
      {children}
    </motion.h3>
  ),

  // Enhanced blockquotes
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

  // Enhanced lists
  ul: ({ children }) => (
    <ul className="my-6 ml-6 list-disc marker:text-primary [&>li]:mt-2">
      {children}
    </ul>
  ),

  ol: ({ children }) => (
    <ol className="my-6 ml-6 list-decimal marker:text-primary [&>li]:mt-2">
      {children}
    </ol>
  ),

  // Animated tables
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
    <td className="px-4 py-3 text-sm text-foreground">
      {children}
    </td>
  ),

  // Enhanced paragraphs
  p: ({ children }) => (
    <p className="leading-7 text-foreground [&:not(:first-child)]:mt-6">
      {children}
    </p>
  ),

  // Strong text
  strong: ({ children }) => (
    <span className="font-semibold text-foreground">
      {children}
    </span>
  ),

  // Emphasis
  em: ({ children }) => (
    <em className="italic text-muted-foreground">
      {children}
    </em>
  ),

  // Horizontal rule
  hr: () => (
    <Separator.Root className="my-8 h-[1px] bg-border" />
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
    <Tooltip.Provider>
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
    </Tooltip.Provider>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => 
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className
);

Markdown.displayName = 'Markdown';
