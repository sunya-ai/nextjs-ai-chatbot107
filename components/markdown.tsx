import Link from 'next/link';
import React, { memo } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';

//
// 1. Define custom component mappings for ReactMarkdown
//
const components: Partial<Components> = {
  // Code blocks
  // @ts-expect-error - because react-markdown Components types can be broad
  code: CodeBlock,

  // If CodeBlock handles syntax highlighting, we usually don't need a custom <pre>.
  // But here we keep it just for completeness:
  pre: ({ children }) => <>{children}</>,

  //
  // Ordered List (<ol>): use decimal numbering, indent, etc.
  //
  ol: ({ node, children, ...props }) => {
    return (
      <ol className="list-decimal list-outside pl-6" {...props}>
        {children}
      </ol>
    );
  },

  //
  // Unordered List (<ul>): use bullets, indent, etc.
  //
  ul: ({ node, children, ...props }) => {
    return (
      <ul className="list-disc list-outside pl-6" {...props}>
        {children}
      </ul>
    );
  },

  //
  // List Item (<li>): small vertical spacing
  //
  li: ({ node, children, ...props }) => {
    return (
      <li className="py-1" {...props}>
        {children}
      </li>
    );
  },

  //
  // Bold Text
  //
  strong: ({ node, children, ...props }) => {
    return (
      <span className="font-semibold" {...props}>
        {children}
      </span>
    );
  },

  //
  // Hyperlinks
  //
  a: ({ node, children, ...props }) => {
    return (
      // @ts-expect-error - ignoring type check for Link props
      <Link
        className="text-blue-500 hover:underline"
        target="_blank"
        rel="noreferrer"
        {...props}
      >
        {children}
      </Link>
    );
  },

  //
  // Headings (h1...h6)
  //
  h1: ({ node, children, ...props }) => {
    return (
      <h1 className="text-3xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h1>
    );
  },
  h2: ({ node, children, ...props }) => {
    return (
      <h2 className="text-2xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ node, children, ...props }) => {
    return (
      <h3 className="text-xl font-semibold mt-6 mb-2" {...props}>
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

  //
  // Tables (GFM)
  //
  table: ({ node, children, ...props }) => {
    return (
      <table className="w-full border-collapse border border-gray-300 my-4" {...props}>
        {children}
      </table>
    );
  },
  thead: ({ node, children, ...props }) => {
    return (
      <thead className="bg-gray-100" {...props}>
        {children}
      </thead>
    );
  },
  tbody: ({ node, children, ...props }) => {
    return <tbody {...props}>{children}</tbody>;
  },
  tr: ({ node, children, ...props }) => {
    return (
      <tr className="border border-gray-300" {...props}>
        {children}
      </tr>
    );
  },
  th: ({ node, children, ...props }) => {
    return (
      <th className="px-4 py-2 border border-gray-300 font-semibold" {...props}>
        {children}
      </th>
    );
  },
  td: ({ node, children, ...props }) => {
    return (
      <td className="px-4 py-2 border border-gray-300 align-top" {...props}>
        {children}
      </td>
    );
  },
};

//
// 2. Configure remark plugins (GFM for tables, strikethrough, etc.)
//
const remarkPlugins = [remarkGfm];

//
// 3. Build the component
//
const NonMemoizedMarkdown = ({ children }: { children: string }) => {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {children}
    </ReactMarkdown>
  );
};

//
// 4. Export a memoized version if you like
//
export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);
