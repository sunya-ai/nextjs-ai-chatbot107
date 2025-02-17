import Link from 'next/link';
import React, { memo } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';

const components: Partial<Components> = {
  // Code blocks with improved styling
  code: CodeBlock,
  pre: ({ children }) => <div className="rounded-lg overflow-hidden my-4">{children}</div>,

  // Lists with improved spacing and styling
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-outside pl-8 space-y-2 my-4" {...props}>
      {children}
    </ol>
  ),

  ul: ({ children, ...props }) => (
    <ul className="list-disc list-outside pl-8 space-y-2 my-4" {...props}>
      {children}
    </ul>
  ),

  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...props}>
      {children}
    </li>
  ),

  // Enhanced text elements
  strong: ({ children, ...props }) => (
    <span className="font-semibold text-gray-900" {...props}>
      {children}
    </span>
  ),

  // Modern link styling
  a: ({ children, ...props }) => (
    <Link
      className="text-blue-600 hover:text-blue-800 transition-colors duration-200 underline decoration-blue-300 hover:decoration-blue-600"
      target="_blank"
      rel="noreferrer"
      {...props}
    >
      {children}
    </Link>
  ),

  // Enhanced heading hierarchy
  h1: ({ children, ...props }) => (
    <h1 className="text-4xl font-bold text-gray-900 mt-8 mb-4 leading-tight" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-3xl font-semibold text-gray-900 mt-8 mb-4 leading-tight" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-2xl font-semibold text-gray-800 mt-6 mb-3 leading-tight" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="text-xl font-semibold text-gray-800 mt-6 mb-3 leading-tight" {...props}>
      {children}
    </h4>
  ),
  h5: ({ children, ...props }) => (
    <h5 className="text-lg font-semibold text-gray-700 mt-4 mb-2 leading-tight" {...props}>
      {children}
    </h5>
  ),
  h6: ({ children, ...props }) => (
    <h6 className="text-base font-semibold text-gray-700 mt-4 mb-2 leading-tight" {...props}>
      {children}
    </h6>
  ),

  // Enhanced table styling
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-8 rounded-lg border border-gray-200 shadow-sm">
      <table className="w-full border-collapse bg-white" {...props}>
        {children}
      </table>
    </div>
  ),

  thead: ({ children, ...props }) => (
    <thead className="bg-gray-50 border-b border-gray-200" {...props}>
      {children}
    </thead>
  ),

  tbody: ({ children, ...props }) => (
    <tbody className="divide-y divide-gray-200" {...props}>
      {children}
    </tbody>
  ),

  tr: ({ children, ...props }) => (
    <tr className="hover:bg-gray-50 transition-colors duration-150" {...props}>
      {children}
    </tr>
  ),

  th: ({ children, ...props }) => (
    <th 
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50" 
      {...props}
    >
      {children}
    </th>
  ),

  td: ({ children, ...props }) => (
    <td className="px-6 py-4 text-sm text-gray-600 align-middle" {...props}>
      {children}
    </td>
  ),

  // Add paragraph styling
  p: ({ children, ...props }) => (
    <p className="text-gray-600 leading-relaxed my-4" {...props}>
      {children}
    </p>
  ),

  // Add blockquote styling
  blockquote: ({ children, ...props }) => (
    <blockquote 
      className="border-l-4 border-gray-200 pl-4 my-4 italic text-gray-600"
      {...props}
    >
      {children}
    </blockquote>
  ),
};

// Configure remark plugins
const remarkPlugins = [remarkGfm];

// Performance-optimized markdown component
const NonMemoizedMarkdown = ({ 
  children,
  className = ''
}: { 
  children: string;
  className?: string;
}) => {
  return (
    <div className={`prose max-w-none ${className}`}>
      <ReactMarkdown 
        remarkPlugins={remarkPlugins} 
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

// Export memoized version with proper prop comparison
export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => 
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className
);

// Add display name for better debugging
Markdown.displayName = 'Markdown';
