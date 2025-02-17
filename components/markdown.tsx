import Link from 'next/link';
import React, { memo } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Calendar,
  ArrowUpRight,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const components: Partial<Components> = {
  // Code handling
  code: ({ className, children }) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    
    if (language) {
      return (
        <Card className="my-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <FileText size={16} />
                {language.toUpperCase()}
              </span>
            </div>
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
  
  // Lists with improved spacing and icons
  ol: ({ children, ...props }) => (
    <ol className="my-6 ml-6 list-decimal [&>li]:mt-2 space-y-1" {...props}>
      {children}
    </ol>
  ),

  ul: ({ children, ...props }) => (
    <ul className="my-6 ml-6 space-y-2" {...props}>
      {children}
    </ul>
  ),

  li: ({ children, ...props }) => (
    <li className="flex gap-2 items-start" {...props}>
      <CheckCircle2 className="h-5 w-5 mt-1 flex-shrink-0 text-primary/60" />
      <span>{children}</span>
    </li>
  ),

  // Enhanced text formatting
  strong: ({ children, ...props }) => (
    <span className="font-semibold text-foreground" {...props}>
      {children}
    </span>
  ),

  em: ({ children, ...props }) => (
    <span className="italic text-muted-foreground" {...props}>
      {children}
    </span>
  ),

  // Modern link styling
  a: ({ children, href, ...props }) => (
    <Link
      href={href || '#'}
      className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4 hover:text-primary/80"
      target="_blank"
      rel="noreferrer"
      {...props}
    >
      {children}
      <ArrowUpRight className="h-3 w-3" />
    </Link>
  ),

  // Enhanced heading hierarchy
  h1: ({ children, ...props }) => (
    <div className="mb-8">
      <h1 
        className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl"
        {...props}
      >
        {children}
      </h1>
      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>Updated January 2025</span>
      </div>
    </div>
  ),

  h2: ({ children, ...props }) => (
    <>
      <h2 
        className="scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0 mt-10 mb-4"
        {...props}
      >
        {children}
      </h2>
    </>
  ),

  h3: ({ children, ...props }) => (
    <h3 
      className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4"
      {...props}
    >
      {children}
    </h3>
  ),

  // Modern table styling
  table: ({ children, ...props }) => (
    <div className="my-6 w-full overflow-auto">
      <table 
        className="w-full border-collapse text-sm" 
        {...props}
      >
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

  // Enhanced paragraph styling
  p: ({ children, ...props }) => (
    <p 
      className="leading-7 [&:not(:first-child)]:mt-6"
      {...props}
    >
      {children}
    </p>
  ),

  // Modern blockquote styling with card
  blockquote: ({ children, ...props }) => (
    <Card className="my-6 bg-primary/5">
      <CardContent className="p-6">
        <blockquote 
          className="border-l-2 border-primary pl-6 italic text-primary-foreground"
          {...props}
        >
          {children}
        </blockquote>
      </CardContent>
    </Card>
  ),

  // Horizontal rule with separator
  hr: () => <Separator className="my-8" />,
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
      "prose-headings:font-heading prose-h1:text-4xl",
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
