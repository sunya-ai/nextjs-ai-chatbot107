import Link from 'next/link';
import React, { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ExternalLink } from 'lucide-react';

const components: Partial<Components> = {
  // @ts-expect-error
  code: CodeBlock,
  pre: ({ children }) => <>{children}</>,
  root: ({ children }) => (
    <div className="max-w-prose mx-auto">{children}</div>
  ),
  ol: ({ node, children, ...props }) => {
    return (
      <ol className="list-decimal list-outside ml-4 space-y-4 font-semibold [counter-reset:list-item]" {...props}>
        {children}
      </ol>
    );
  },
  li: ({ node, children, ...props }) => {
    return (
      <li className="py-1 [&>strong]:mr-2 break-words" {...props}>
        {children}
      </li>
    );
  },
  ul: ({ node, children, ...props }) => {
    return (
      <ul className="list-disc list-outside ml-8 space-y-2" {...props}>
        {children}
      </ul>
    );
  },
  p: ({ node, children, ...props }) => {
    return (
      <p className="my-2 leading-relaxed break-words" {...props}>
        {children}
      </p>
    );
  },
  strong: ({ node, children, ...props }) => {
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
  a: ({ node, children, href, ...props }) => {
    return (
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
              <ExternalLink className="w-3 h-3" />
              {children}
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{href}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
  h1: ({ node, children, ...props }) => {
    return (
      <h1 className="text-xl font-bold mt-6 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800" {...props}>
        {children}
      </h1>
    );
  },
  h2: ({ node, children, ...props }) => {
    return (
      <h2 className="text-lg font-bold mt-8 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ node, children, ...props }) => {
    return (
      <h3 className="text-base font-bold mt-6 mb-3" {...props}>
        {children}
      </h3>
    );
  },
  h4: ({ node, children, ...props }) => {
    return (
      <h4 className="text-base font-semibold mt-6 mb-2" {...props}>
        {children}
      </h4>
    );
  },
  h5: ({ node, children, ...props }) => {
    return (
      <h5 className="text-sm font-semibold mt-6 mb-2" {...props}>
        {children}
      </h5>
    );
  },
  h6: ({ node, children, ...props }) => {
    return (
      <h6 className="text-xs font-semibold mt-6 mb-2" {...props}>
        {children}
      </h6>
    );
  },
  table: ({ node, children, ...props }) => {
    return (
      <div className="my-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <table className="w-full border-collapse" {...props}>
          {children}
        </table>
      </div>
    );
  },
  thead: ({ node, children, ...props }) => {
    return (
      <thead className="bg-zinc-50/50 dark:bg-zinc-900" {...props}>
        {children}
      </thead>
    );
  },
  tbody: ({ node, children, ...props }) => {
    return (
      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800" {...props}>
        {children}
      </tbody>
    );
  },
  tr: ({ node, children, ...props }) => {
    return (
      <tr 
        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-150" 
        {...props}
      >
        {children}
      </tr>
    );
  },
  td: ({ node, children, ...props }) => {
    return (
      <td className="px-6 py-3 text-sm whitespace-normal" {...props}>
        {children}
      </td>
    );
  },
  th: ({ node, children, ...props }) => {
    return (
      <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-zinc-600 dark:text-zinc-300 uppercase" {...props}>
        {children}
      </th>
    );
  }
};

const remarkPlugins = [remarkGfm];

const NonMemoizedMarkdown = ({ children }: { children: string }) => {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {children}
    </ReactMarkdown>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);
