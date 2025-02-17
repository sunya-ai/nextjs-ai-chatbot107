"use client"

import { Circle, Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"

export interface WorkflowFile {
  path: string
  status: "planning" | "generating" | "editing" | "complete"
}

interface WorkflowStatusProps {
  currentMessage?: string
  isLoading?: boolean
}

const thinkingMessages = [
  "Give me a sec… this response needs seasoning.",
  "I'm not AI - I'm just the intern stirring the coffee pot.",
  "Hang on, I'm overthinking this answer.",
  "Wait a moment—I'm still trying to sound clever.",
  "Give me a second—I'm working on a comeback.",
  "Wait a sec—I'm not as smart as you think.",
  "Give me a minute—I want to impress you, not stress you.",
  "Hold on, I'm trying hard not to disappoint you.",
  "Wait a sec, I'm trying not to screw this up for you.",
  "I'm not AI—just an intern at a coffee shop",
  "Give me a moment—I'm not trying to let you down.",
  "Hang tight—I'm rebooting my brain for you.",
]

export function WorkflowStatus({ currentMessage, isLoading = true }: WorkflowStatusProps) {
  const [stage, setStage] = useState(0)
  const [thinkingMessage, setThinkingMessage] = useState(thinkingMessages[0])

  useEffect(() => {
    const timer = setInterval(() => {
      setStage((prev) => (prev + 1) % 3)
      setThinkingMessage(thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)])
    }, 2000)

    return () => clearInterval(timer)
  }, [])

  const files: WorkflowFile[] = [
    {
      path: "Processing initial request",
      status: stage >= 0 ? "complete" : "planning",
    },
    {
      path: "Scanning Sunya data + the web",
      status: stage >= 1 ? "generating" : "planning",
    },
    {
      path: "Refining response",
      status: stage >= 2 ? "generating" : "planning",
    },
  ]

  return (
    <div className="bg-white/80 dark:bg-black/40 backdrop-blur-sm text-gray-900 dark:text-zinc-100 rounded-lg border border-gray-200/50 dark:border-white/10 shadow-lg shadow-[#454b1b]/5 w-full max-w-sm overflow-hidden">
      <div className="p-2 border-b border-gray-200/50 dark:border-white/10">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-gray-500 dark:text-zinc-400" />
          ) : (
            <Circle className="h-3 w-3 text-gray-500 dark:text-zinc-400" />
          )}
          <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">
            {isLoading ? thinkingMessage : "AI has responded"}
          </span>
        </div>
      </div>

      <AnimatePresence>
        <div className="space-y-0.5 p-2">
          {files.map((file, index) => (
            <motion.div
              key={file.path}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center justify-between py-0.5"
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-2.5 w-2.5 rounded-full flex items-center justify-center ${
                    file.status === "complete"
                      ? "bg-[#454b1b]/10 ring-1 ring-[#454b1b]"
                      : file.status === "generating"
                        ? "bg-[#1a365d]/10 ring-1 ring-[#1a365d]"
                        : "bg-gray-400/10 dark:bg-zinc-500/10 ring-1 ring-gray-400 dark:ring-zinc-500"
                  }`}
                >
                  <Circle
                    className={`h-1.5 w-1.5 ${
                      file.status === "complete"
                        ? "fill-[#454b1b] text-[#454b1b]"
                        : file.status === "generating"
                          ? "fill-[#1a365d] text-[#1a365d]"
                          : "fill-gray-400 dark:fill-zinc-500 text-gray-400 dark:text-zinc-500"
                    }`}
                  />
                </div>
                <span className="text-xs font-mono text-gray-500 dark:text-zinc-400">{file.path}</span>
              </div>
              <motion.span
                key={file.status}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-zinc-400"
              >
                {file.status}
              </motion.span>
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
    </div>
  )
}

