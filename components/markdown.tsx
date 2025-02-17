"use client"

import React from "react"
import type { Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import rehypeRaw from "rehype-raw"
import rehypeStringify from "rehype-stringify"
import Link from "next/link"

interface CodeBlockProps {
  className?: string
  children: React.ReactNode
  node?: any
  inline?: boolean
}

const CodeBlock: React.FC<CodeBlockProps> = ({ className, children, node, inline }) => (
  <pre className={className}>
    <code className={className}>{children}</code>
  </pre>
)

const components: Partial<Components> = {
  code: ({ node, inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || "")
    return (
      <CodeBlock node={node} inline={inline} className={className} {...props}>
        {String(children).replace(/\n$/, "")}
      </CodeBlock>
    )
  },
  // Add other components here as needed
  a: ({ href, children }) => <Link href={href}>{children}</Link>,
}

const processMarkdown = async (markdown: string) => {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(markdown)

  return result.toString()
}

const Markdown: React.FC<{ markdown: string }> = ({ markdown }) => {
  const [html, setHtml] = React.useState("")

  React.useEffect(() => {
    const process = async () => {
      const processedHtml = await processMarkdown(markdown)
      setHtml(processedHtml)
    }
    process()
  }, [markdown])

  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

export default Markdown

