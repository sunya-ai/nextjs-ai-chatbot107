import React, { memo, useState } from 'react'
import type { FC } from 'react'
import ReactMarkdown, { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { motion } from 'framer-motion'
import * as Separator from '@radix-ui/react-separator'
import {
  ArrowUpRight,
  FileText,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'

// If you have a `cn` utility, import it. Otherwise, replace `cn(...)` calls
// with your own string joins or remove them as needed.
import { cn } from '@/lib/utils'

// 1) Define a Code component matching React Markdown’s expected signature:
const Code: Components['code'] = ({
  node,
  inline,
  className,
  children,
  ...props
}) => {
  /**
   * According to React Markdown’s types:
   * - `children` is a string (or array of strings),
   * - `inline` indicates inline vs. block code,
   * - `className` may include "language-xxx",
   * - `node` is the parsed syntax tree node (unused here, so we can ignore it).
   */

  const [copied, setCopied] = useState(false)

  // Safely turn `children` into a single string.
  // In practice, React Markdown usually passes a single string here,
  // but if it’s an array, we join them.
  const codeString = Array.isArray(children)
    ? children.join('')
    : (children as string)

  // Extract the language name (e.g. "javascript" from "language-javascript")
  const language = className?.replace('language-', '') || 'text'

  // Copy function (only copies if codeString is defined)
  const copyToClipboard = () => {
    if (codeString) {
      navigator.clipboard.writeText(codeString).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  // If inline code: just a simple <code> element
  if (inline) {
    return (
      <code
        {...props}
        className="rounded-md bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm text-foreground"
      >
        {codeString}
      </code>
    )
  }

  // Otherwise, render a block code snippet with copy functionality
  return (
    <div {...props} className="my-6 rounded-lg border bg-muted/50 overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/70">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {language.toUpperCase()}
          </span>
        </div>
        <button
          onClick={copyToClipboard}
          className="p-2 hover:bg-muted rounded-md transition-colors"
          title={copied ? 'Copied!' : 'Copy code'}
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4">
        <code className={className}>{codeString}</code>
      </pre>
    </div>
  )
}

// 2) Define custom components for other markdown elements
const components: Partial<Components> = {
  code: Code,

  a: ({ children, href }) => (
    <motion.a
      href={href || '#'}
      whileHover={{ scale: 1.02 }}
      className="inline-flex items-center gap-1.5 text-primary hover:text-primary/90
                 border border-primary/20 hover:border-primary/40 px-2 py-0.5 rounded-md 
                 transition-colors"
      target="_blank"
      rel="noreferrer"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </motion.a>
  ),

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

  p: ({ children }) => (
    <p className="leading-7 text-foreground [&:not(:first-child)]:mt-6">
      {children}
    </p>
  ),

  strong: ({ children }) => (
    <span className="font-semibold text-foreground">
      {children}
    </span>
  ),

  ul: ({ children }) => (
    <ul className="my-6 ml-6 list-disc marker:text-primary [&>li]:mt-2 text-foreground">
      {children}
    </ul>
  ),

  ol: ({ children }) => (
    <ol className="my-6 ml-6 list-decimal marker:text-primary [&>li]:mt-2 text-foreground">
      {children}
    </ol>
  ),

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
    <thead className="border-b bg-muted/50">{children}</thead>
  ),

  tbody: ({ children }) => (
    <tbody className="divide-y divide-border">{children}</tbody>
  ),

  tr: ({ children }) => (
    <tr className="transition-colors hover:bg-muted/50">{children}</tr>
  ),

  th: ({ children }) => (
    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {children}
    </th>
  ),

  td: ({ children }) => (
    <td className="px-4 py-3 text-sm text-foreground">{children}</td>
  ),

  hr: () => <Separator.Root className="my-8 h-[1px] bg-border" />,
}

// 3) Wrap the markdown usage in a component
interface MarkdownProps {
  children: string
  className?: string
}

const NonMemoizedMarkdown: FC<MarkdownProps> = ({ children, className = '' }) => {
  return (
    <div
      className={cn(
        'prose prose-stone dark:prose-invert max-w-none',
        'prose-headings:text-foreground',
        'prose-p:text-foreground',
        'prose-strong:text-foreground',
        'prose-ul:text-foreground',
        'prose-ol:text-foreground',
        className
      )}
    >
      <ReactMarkdown
        // Add remark plugins or rehype plugins as you like
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

// 4) Export a memoized version of this Markdown component
export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className
)

Markdown.displayName = 'Markdown'
