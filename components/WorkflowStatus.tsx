import { Loader2, FileCode, Circle } from "lucide-react"
import { Card } from "@/components/ui/card"

export interface WorkflowFile {
  path: string
  status: "planning" | "generating" | "editing" | "complete"
}

interface WorkflowStatusProps {
  isLoading: boolean
  currentMessage?: string
  files?: WorkflowFile[]
}

export function WorkflowStatus({ isLoading, currentMessage, files = [] }: WorkflowStatusProps) {
  if (!isLoading) return null

  return (
    <Card className="bg-zinc-900 text-zinc-100 p-4 w-full max-w-md">
      <div className="flex items-center gap-2 text-emerald-500 mb-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">AI is thinking...</span>
      </div>

      {currentMessage && (
        <div className="mb-4 p-3 rounded-md bg-zinc-800/50 border border-zinc-700">
          <div className="text-xs text-zinc-400">Current Task</div>
          <div className="mt-1 text-sm">{currentMessage}</div>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Circle
                  className={`h-2 w-2 ${
                    file.status === "complete"
                      ? "fill-emerald-500 text-emerald-500"
                      : file.status === "generating"
                        ? "fill-amber-500 text-amber-500"
                        : "fill-zinc-500 text-zinc-500"
                  }`}
                />
                <FileCode className="h-3 w-3 text-zinc-400" />
                <span className="text-sm font-mono">{file.path}</span>
              </div>
              <span className="text-xs text-zinc-400">{file.status}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

