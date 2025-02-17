import Link from 'next/link';
import React, { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';

const components: Partial<Components> = {
  // @ts-expect-error
  code: CodeBlock,
  pre: ({ children }) => <>{children}</>,
  ol: ({ node, children, ...props }) => {
    return (
      <ol className="list-decimal list-outside ml-4 space-y-4 font-semibold [counter-reset:list-item]" {...props}>
        {children}
      </ol>
    );
  },
  li: ({ node, children, ...props }) => {
    return (
      <li className="py-1 [&>strong]:mr-2" {...props}>
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
  strong: ({ node, children, ...props }) => {
    return (
      <span className="font-semibold" {...props}>
        {children}
      </span>
    );
  },
  a: ({ node, children, href, ...props }) => {
    return (
      <Link
        href={href ?? '#'}
        className="font-mono text-[13px] px-1.5 py-0.5 rounded-sm border border-zinc-200 bg-zinc-50/50 hover:bg-zinc-100/80 transition-colors duration-200 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:bg-zinc-900"
        target="_blank"
        rel="noreferrer"
        {...props}
      >
        {children}
      </Link>
    );
  },
  h1: ({ node, children, ...props }) => {
    return (
      <h1 className="text-3xl font-semibold mt-6 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800" {...props}>
        {children}
      </h1>
    );
  },
  h2: ({ node, children, ...props }) => {
    return (
      <h2 className="text-2xl font-bold mt-8 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ node, children, ...props }) => {
    return (
      <h3 className="text-xl font-semibold mt-6 mb-3" {...props}>
        {children}
      </h3>
    );
  },
  h4: ({ node, children, ...props }) => {
    return (
      <h4 className="text-lg font-semibold mt-6 mb-2" {...props}>
        {children}
      </h4>
    );
  },
  h5: ({ node, children, ...props }) => {
    return (
      <h5 className="text-base font-semibold mt-6 mb-2" {...props}>
        {children}
      </h5>
    );
  },
  h6: ({ node, children, ...props }) => {
    return (
      <h6 className="text-sm font-semibold mt-6 mb-2" {...props}>
        {children}
      </h6>
    );
  },
  table: ({ node, children, ...props }) => {
    return (
      <div className="my-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse" {...props}>
          {children}
        </table>
      </div>
    );
  },
  thead: ({ node, children, ...props }) => {
    return (
      <thead className="bg-zinc-50 dark:bg-zinc-900/50" {...props}>
        {children}
      </thead>
    );
  },
  tbody: ({ node, children, ...props }) => {
    return (
      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800" {...props}>
        {children}
      </tbody>
    );
  },
  tr: ({ node, children, ...props }) => {
    return (
      <tr 
        className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors" 
        {...props}
      >
        {children}
      </tr>
    );
  },
  td: ({ node, children, ...props }) => {
    return (
      <td className="px-4 py-3" {...props}>
        {children}
      </td>
    );
  },
  th: ({ node, children, ...props }) => {
    return (
      <th className="px-4 py-3 text-left font-semibold" {...props}>
        {children}
      </th>
    );
  },
  blockquote: ({ node, children, ...props }) => {
    return (
      <blockquote 
        className="border-l-4 border-zinc-200 dark:border-zinc-800 pl-4 py-2 my-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-r-lg" 
        {...props}
      >
        {children}
      </blockquote>
    );
  },
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
