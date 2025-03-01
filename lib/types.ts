import type { Message as BaseMessage } from "ai"
import type { ArtifactKind } from "@/components/artifact"

// Export BaseMessage as Message for external use (type-only export)
export type { BaseMessage as Message }

// Define CustomMessage with required chatId to match database schema
export interface CustomMessage extends BaseMessage {
  chatId: string // Required for database alignment
  sources?: { title: string; url: string }[] // Optional sources from AI SDK
  metadata?: any | null // Optional metadata for artifacts or other data
  reasoning?: string | undefined // Match BaseMessage's reasoning type (string or undefined)
  content: string | MessageContent[]
  toolInvocations?: ToolInvocation[]
}

export interface ToolCallContent {
  type: "tool-call"
  toolCallId?: string
  toolName?: string
  args?: any
}

export interface TextContent {
  type: "text"
  text: string
}

export interface ToolResultContent {
  type: "tool-result"
  toolCallId: string
  result?: any
}

export interface ReasoningContent {
  type: "reasoning"
  reasoning: string
}

export type MessageContent = ToolCallContent | TextContent | ToolResultContent | ReasoningContent

export interface ToolInvocation {
  state: "call" | "result"
  toolCallId: string
  toolName?: string
  args?: any
  result?: any
}

export interface UIArtifact {
  title: string
  documentId: string
  kind: ArtifactKind // Use ArtifactKind for type safety
  content: string
  isVisible: boolean
  status: "streaming" | "idle"
  boundingBox: {
    top: number
    left: number
    width: number
    height: number
  }
}

export interface Chat {
  id: string
  title: string
  createdAt: Date
  userId: string
  path: string
  messages: CustomMessage[]
  sharePath?: string
}

export type ServerActionResult<Result> = Promise<
  | Result
  | {
      error: string
    }
>

