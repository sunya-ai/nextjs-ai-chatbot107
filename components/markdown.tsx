import Link from 'next/link';
import React, { memo } from 'react';
import { MDXContent } from '@mdx-js/react'; // Updated to MDXContent
import { compile } from '@mdx-js/mdx'; // For MDX compilation
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight'; // For code highlighting
import rehypeRaw from 'rehype-raw'; // For raw HTML in MDX
import { CodeBlock } from './code-block';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

// Source preview component for v0-style boxes
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

// MDX components for rendering
const components = {
  code: CodeBlock,
  pre: ({ children }) => <>{children}</>,
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-outside ml-4 space-y-4 font-semibold [counter-reset:list-item]" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="py-1 [&>strong]:mr-2 break-words" {...props}>
      {children}
    </li>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc list-outside ml-8 space-y-2" {...props}>
      {children}
    </ul>
  ),
  p: ({ children, ...props }) => (
    <p className="my-2 leading-relaxed break-words" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }) => {
    const cleanText = children?.toString().replace(/\*+/g, '').trim() || '';
    const isCitation = /^\[\d+(,\s*\d+)*\]$/.test(cleanText);
    
    if (isCitation) {
      const citationIds = cleanText
        .replace(/[\[\]]/g, '')
        .split(',')
        .map((id) => id.trim())
        .map(Number);
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
  a: ({ href, children, ...props }) => (
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
  h1: ({ children, ...props }) => (
    <h1 className="text-xl font-bold mt-6 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-lg font-bold mt-8 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-base font-bold mt-6 mb-3" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="text-base font-semibold mt-6 mb-2" {...props}>
      {children}
    </h4>
  ),
  h5: ({ children, ...props }) => (
    <h5 className="text-sm font-semibold mt-6 mb-2" {...props}>
      {children}
    </h5>
  ),
  h6: ({ children, ...props }) => (
    <h6 className="text-xs font-semibold mt-6 mb-2" {...props}>
      {children}
    </h6>
  ),
  table: ({ children, ...props }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <table className="w-full border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-zinc-50/50 dark:bg-zinc-900" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }) => (
    <tr 
      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-150" 
      {...props}
    >
      {children}
    </tr>
  ),
  td: ({ children, ...props }) => (
    <td className="px-6 py-3 text-sm whitespace-normal" {...props}>
      {children}
    </td>
  ),
  th: ({ children, ...props }) => (
    <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-zinc-600 dark:text-zinc-300 uppercase" {...props}>
      {children}
    </th>
  ),
};

// Collect citations for source preview
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
      // Simulate a source URL (replace with actual logic or API call)
      sources.push({ id: `source-${id}`, url: `https://example.com/source-${id}` });
    });
  }

  return [...new Set(sources)]; // Remove duplicates
};

// Compile MDX content asynchronously
const compileMDX = async (content: string): Promise<string> => {
  const compiled = await compile(content, {
    outputFormat: 'function-body',
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeHighlight, rehypeRaw],
  });
  return compiled.toString(); // Return MDX as a string (function body)
};

const NonMemoizedMarkdown = async ({ children: initialContent }: { children: string }) => {
  const sources = collectSources(initialContent);
  const mdxContent = await compileMDX(initialContent);

  return (
    <div className="prose prose-zinc dark:prose-invert max-w-none">
      <MDXContent components={components}>{mdxContent}</MDXContent>
      <SourcePreview sources={sources} />
    </div>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);
