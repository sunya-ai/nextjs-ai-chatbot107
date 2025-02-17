import Link from 'next/link';
import React, { memo } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent } from "@/components/ui/card";

const components: Partial<Components> = {
  // Simpler inline code handling
  code: ({ className, children }) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    
    if (language) {
      return (
        <Card className="my-4">
          <CardContent className="p-4">
            <pre className="overflow-x-auto">
              <code className={className}>{children}</code>
            </pre>
          </CardContent>
        </Card>
      );
    }

    return (
      <code className="bg-muted px-1.5 py-0.5 rounded-md text-sm font-mono">
        {children}
      </code>
    );
  },
  
  // Lists
  ol: ({ children, ...props }) => (
    <ol className="my-6 ml-6 list-decimal [&>li]:mt-2" {...props}>
      {children}
    </ol>
  ),

  ul: ({ children, ...props }) => (
    <ul className="my-6 ml-6 list-disc [&>li]:mt-2" {...props}>
      {children}
    </ul>
  ),

  // Text formatting
  strong: ({ children, ...props }) => (
    <span className="font-semibold text-foreground" {...props}>
      {children}
    </span>
  ),

  // Links
  a: ({ children, href, ...props }) => (
    <Link
      href={href || '#'}
      className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
      target="_blank"
      rel="noreferrer"
      {...props}
    >
      {children}
    </Link>
  ),

  // Headings
  h1: ({ children, ...props }) => (
    <h1 
      className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl mb-8"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 
      className="scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0 mt-10 mb-4"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 
      className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4"
      {...props}
    >
      {children}
    </h3>
  ),

  // Tables
  table: ({ children, ...props }) => (
    <div className="my-6 w-full overflow-auto">
      <table className="w-full border-collapse text-sm" {...props}>
        {children}
      </table>
    </div>
  ),

  thead: ({ children, ...props }) => (
    <thead className="border-b bg-muted/50" {...props}>
      {children}
    </thead>
  ),

  tbody: ({ children, ...props }) => (
    <tbody className="[&>tr:last-child]:border-0" {...props}>
      {children}
    </tbody>
  ),

  tr: ({ children, ...props }) => (
    <tr 
      className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
      {...props}
    >
      {children}
    </tr>
  ),

  th: ({ children, ...props }) => (
    <th 
      className="h-10 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
      {...props}
    >
      {children}
    </th>
  ),

  td: ({ children, ...props }) => (
    <td 
      className="p-4 align-middle [&:has([role=checkbox])]:pr-0"
      {...props}
    >
      {children}
    </td>
  ),

  // Paragraphs
  p: ({ children, ...props }) => (
    <p 
      className="leading-7 [&:not(:first-child)]:mt-6"
      {...props}
    >
      {children}
    </p>
  ),

  // Blockquotes
  blockquote: ({ children, ...props }) => (
    <Card className="my-6">
      <CardContent className="p-6">
        <blockquote 
          className="border-l-2 border-primary pl-6 italic text-muted-foreground"
          {...props}
        >
          {children}
        </blockquote>
      </CardContent>
    </Card>
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
    <div className={`prose prose-stone dark:prose-invert max-w-none ${className}`}>
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
