"use client"

import { Loader2, Circle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"

export interface WorkflowFile {
  path: string
  status: "planning" | "generating" | "editing" | "complete"
}

interface WorkflowStatusProps {
  isLoading: boolean
  currentMessage?: string
}

export function WorkflowStatus({ isLoading, currentMessage }: WorkflowStatusProps) {
  const [stage, setStage] = useState(0)

  // Reset and start animation sequence when loading starts
  useEffect(() => {
    if (isLoading) {
      setStage(0)
      const timer = setInterval(() => {
        setStage((prev) => (prev + 1) % 3)
      }, 2000) // Change stage every 2 seconds

      return () => clearInterval(timer)
    }
  }, [isLoading])

  if (!isLoading) return null

  // Dynamic workflow files based on animation stage
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
    <div className="bg-zinc-900/90 text-zinc-100 rounded-lg p-6 w-full max-w-xl backdrop-blur-sm">
      <div className="flex items-center gap-2 text-emerald-500/90 mb-6">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-base font-medium">AI is thinking...</span>
      </div>

      {currentMessage && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="text-sm text-zinc-500 mb-2">Current Task</div>
          <div className="text-base">{currentMessage}</div>
        </motion.div>
      )}

      <AnimatePresence>
        <div className="space-y-3">
          {files.map((file, index) => (
            <motion.div
              key={file.path}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.2 }}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Circle
                  className={`h-2.5 w-2.5 ${
                    file.status === "complete"
                      ? "fill-emerald-500/90 text-emerald-500/90"
                      : file.status === "generating"
                        ? "fill-amber-500/90 text-amber-500/90"
                        : "fill-zinc-500/90 text-zinc-500/90"
                  }`}
                />
                <span className="text-sm font-mono">{file.path}</span>
              </div>
              <motion.span
                key={file.status}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-zinc-500"
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

