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
}

export function WorkflowStatus({ currentMessage }: WorkflowStatusProps) {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setStage((prev) => (prev + 1) % 3)
    }, 2000)

    return () => clearInterval(timer)
  }, [])

  const files: WorkflowFile[] = [
    {
      path: "components/Messages.tsx",
      status: stage >= 0 ? "complete" : "planning",
    },
    {
      path: "components/ThinkingMessage.tsx",
      status: stage >= 1 ? "generating" : "planning",
    },
    {
      path: "hooks/use-messages.ts",
      status: stage >= 2 ? "generating" : "planning",
    },
  ]

  return (
    <div className="bg-black/40 backdrop-blur-sm text-zinc-100 rounded-lg border border-white/10 shadow-lg shadow-[#454b1b]/5 w-full max-w-sm overflow-hidden">
      <div className="p-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
          <span className="text-xs font-medium text-zinc-400">AI is thinking...</span>
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
                        : "bg-zinc-500/10 ring-1 ring-zinc-500"
                  }`}
                >
                  <Circle
                    className={`h-1.5 w-1.5 ${
                      file.status === "complete"
                        ? "fill-[#454b1b] text-[#454b1b]"
                        : file.status === "generating"
                          ? "fill-[#1a365d] text-[#1a365d]"
                          : "fill-zinc-500 text-zinc-500"
                    }`}
                  />
                </div>
                <span className="text-xs font-mono text-zinc-400">{file.path}</span>
              </div>
              <motion.span
                key={file.status}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] uppercase tracking-wider text-zinc-400"
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

