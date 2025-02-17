"use client"

import type React from "react"
import { memo } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import Link from "next/link"
import { motion } from "framer-motion"
import { CodeBlock } from "./code-block"
import { cn } from "@/lib/utils"

const components: Partial<Components> = {
  code: ({ node, inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || "")
    return !inline && match ? (
      <CodeBlock language={match[1]} value={String(children).replace(/\n$/, "")} {...props} />
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
  pre: ({ children }) => <>{children}</>,
  ol: ({ children, ...props }) => (
    <motion.ol
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="list-decimal list-outside ml-6 space-y-2"
      {...props}
    >
      {children}
    </motion.ol>
  ),
  ul: ({ children, ...props }) => (
    <motion.ul
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="list-disc list-outside ml-6 space-y-2"
      {...props}
    >
      {children}
    </motion.ul>
  ),
  li: ({ children, ...props }) => (
    <li className="py-1" {...props}>
      {children}
    </li>
  ),
  strong: ({ children, ...props }) => (
    <span className="font-semibold text-primary" {...props}>
      {children}
    </span>
  ),
  a: ({ href, children, ...props }) => {
    const isExternal = href && (href.startsWith("http") || href.startsWith("www"))
    return (
      <Link
        href={href || "#"}
        className={cn(
          "text-primary font-medium no-underline relative",
          "after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-primary",
          "after:scale-x-0 after:origin-bottom-right after:transition-transform after:duration-300 after:ease-out",
          "hover:after:scale-x-100 hover:after:origin-bottom-left",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
          "motion-reduce:transition-none motion-reduce:hover:transform-none",
        )}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        {...props}
      >
        {children}
        {isExternal && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="inline-block w-4 h-4 ml-1 -mt-1"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
              clipRule="evenodd"
            />
            <path
              fillRule="evenodd"
              d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </Link>
    )
  },
  h1: ({ children, ...props }) => (
    <motion.h1
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="text-4xl font-bold mt-8 mb-4 text-primary"
      {...props}
    >
      {children}
    </motion.h1>
  ),
  h2: ({ children, ...props }) => (
    <motion.h2
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="text-3xl font-bold mt-6 mb-4 text-primary"
      {...props}
    >
      {children}
    </motion.h2>
  ),
  h3: ({ children, ...props }) => (
    <motion.h3
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="text-2xl font-bold mt-6 mb-4 text-primary"
      {...props}
    >
      {children}
    </motion.h3>
  ),
  h4: ({ children, ...props }) => (
    <motion.h4
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="text-xl font-bold mt-6 mb-4 text-primary"
      {...props}
    >
      {children}
    </motion.h4>
  ),
  h5: ({ children, ...props }) => (
    <motion.h5
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="text-lg font-bold mt-6 mb-4 text-primary"
      {...props}
    >
      {children}
    </motion.h5>
  ),
  h6: ({ children, ...props }) => (
    <motion.h6
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="text-base font-bold mt-6 mb-4 text-primary"
      {...props}
    >
      {children}
    </motion.h6>
  ),
  p: ({ children, ...props }) => (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="my-4 leading-7"
      {...props}
    >
      {children}
    </motion.p>
  ),
  blockquote: ({ children, ...props }) => (
    <motion.blockquote
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="border-l-4 border-primary pl-4 py-2 my-4 italic bg-muted"
      {...props}
    >
      {children}
    </motion.blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full divide-y divide-gray-200">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{children}</td>,
}

const remarkPlugins = [remarkGfm]

interface MarkdownProps {
  children: string
  className?: string
}

const NonMemoizedMarkdown: React.FC<MarkdownProps> = ({ children, className = "" }) => {
  return (
    <div className={cn("markdown-content space-y-4", className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children && prevProps.className === nextProps.className,
)

Markdown.displayName = "Markdown"

