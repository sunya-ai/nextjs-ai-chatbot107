// components/markdown.tsx
'use client';

import Link from 'next/link';
import React, { memo } from 'react';
import { compile, run } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { CodeBlock } from './code-block';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode; // Optional to match MDXComponents
  [key: string]: any;
}

const SourcePreview = ({ sources }: { sources: { id: string; url: string }[] }) => {
  if (!sources.length) return null;

  return (
    <div className="mt-6 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-md overflow-y-auto max-h-48">
      <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-300 mb-2">Sources</h3>
      <ul className="space-y-2">
        {sources.map((source, index) => (
          <li key={source.id} className="text-xs text-zinc-500 dark:text-zinc-400">
            <Link
              href={source.url}
              className="hover:underline flex items-center gap-1.5"
              target="_blank"
              rel="noreferrer"
            >
              [{index + 1}] {source.url}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

const components: { [key: string]: React.ComponentType<any> } = {
  code: ({ node, inline, className, children, ...props }: CodeBlockProps) => (
    <CodeBlock node={node} inline={inline} className={className} {...props}>
      {children}
    </CodeBlock>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ol: ({ children, ...props }: React.ComponentProps<'ol'>) => (
    <ol className="list-decimal list-outside ml-4 space-y-4 font-semibold [counter-reset:list-item]" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }: React.ComponentProps<'li'>) => (
    <li className="py-1 [&>strong]:mr-2 break-words" {...props}>
      {children}
    </li>
  ),
  ul: ({ children, ...props }: React.ComponentProps<'ul'>) => (
    <ul className="list-disc list-outside ml-8 space-y-2" {...props}>
      {children}
    </ul>
  ),
  p: ({ children, ...props }: React.ComponentProps<'p'>) => (
    <p className="my-2 leading-relaxed break-words" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }: React.ComponentProps<'strong'>) => {
    const cleanText = children?.toString().replace(/\*+/g, '').trim() || '';
    const isCitation = /^\[\d+(,\s*\d+)*\]$/.test(cleanText);
    
    if (isCitation) {
      return (
        <span className="text-[9px] text-zinc-500 dark:text-zinc-400 align-super bg-zinc-100/50 dark:bg-zinc-800/50 rounded px-1" {...props}>
          {cleanText}
        </span>
      );
    }

    return (
      <span className="font-semibold" {...props}>
        {cleanText}
      </span>
    );
  },
  a: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href ?? '#'}
            className="font-mono text-xs px-1.5 py-0.5 rounded-sm border border-zinc-200 bg-zinc-50/50 hover:bg-zinc-100/80 transition-colors duration-200 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:bg-zinc-900 inline-flex items-center gap-1.5"
            target="_blank"
            rel="noreferrer"
            {...props}
          >
            <ExternalLink className="size-3" />
            {children}
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{href}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
  h1: ({ children, ...props }: React.ComponentProps<'h1'>) => (
    <h1 className="text-xl font-bold mt-6 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: React.ComponentProps<'h2'>) => (
    <h2 className="text-lg font-bold mt-8 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.ComponentProps<'h3'>) => (
    <h3 className="text-base font-bold mt-6 mb-3" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }: React.ComponentProps<'h4'>) => (
    <h4 className="text-base font-semibold mt-6 mb-2" {...props}>
      {children}
    </h4>
  ),
  h5: ({ children, ...props }: React.ComponentProps<'h5'>) => (
    <h5 className="text-sm font-semibold mt-6 mb-2" {...props}>
      {children}
    </h5>
  ),
  h6: ({ children, ...props }: React.ComponentProps<'h6'>) => (
    <h6 className="text-xs font-semibold mt-6 mb-2" {...props}>
      {children}
    </h6>
  ),
  table: ({ children, ...props }: React.ComponentProps<'table'>) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <table className="w-full border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: React.ComponentProps<'thead'>) => (
    <thead className="bg-zinc-50/50 dark:bg-zinc-900" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }: React.ComponentProps<'tbody'>) => (
    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }: React.ComponentProps<'tr'>) => (
    <tr 
      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-150" 
      {...props}
    >
      {children}
    </tr>
  ),
  td: ({ children, ...props }: React.ComponentProps<'td'>) => (
    <td className="px-6 py-3 text-sm whitespace-normal" {...props}>
      {children}
    </td>
  ),
  th: ({ children, ...props }: React.ComponentProps<'th'>) => (
    <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-zinc-600 dark:text-zinc-300 uppercase" {...props}>
      {children}
    </th>
  ),
};

const collectSources = (content: string): { id: string; url: string }[] => {
  const sources: { id: string; url: string }[] = [];
  const citationRegex = /\[\d+(,\s*\d+)*\]/g;
  let match;

  while ((match = citationRegex.exec(content)) !== null) {
    const citationIds = match[0]
      .replace(/[\[\]]/g, '')
      .split(',')
      .map((id) => id.trim())
      .map(Number);
    citationIds.forEach((id) => {
      sources.push({ id: `source-${id}`, url: `https://example.com/source-${id}` });
    });
  }

  return [...new Set(sources)];
};

export const Markdown = memo(
  async ({ children: initialContent }: { children: string }) => {
    const sources = collectSources(initialContent);
    const code = await compile(initialContent, {
      outputFormat: 'function-body',
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypeHighlight, rehypeRaw],
    });
    const { default: MDXContent } = await run(code, runtime);

    return (
      <div className="prose prose-zinc dark:prose-invert max-w-none">
        <MDXContent components={components} />
        <SourcePreview sources={sources} />
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);
