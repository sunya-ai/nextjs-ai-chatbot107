"use client"

import type React from "react"
import { memo } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import Link from "next/link"
import { motion } from "framer-motion" // Add smooth animations
import { CodeBlock } from "./code-block"
import { cn } from "@/lib/utils" // Utility for conditional classes

const components: Partial<Components> = {
  code: CodeBlock, // We'll keep using the separate CodeBlock component
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
  a: ({ href, children, ...props }) => (
    <Link
      href={href || "#"}
      className="text-blue-500 hover:underline transition-colors duration-200"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </Link>
  ),
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

