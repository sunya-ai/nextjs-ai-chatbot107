import { openai } from "@ai-sdk/openai"
import type { AIChatRequest, AIModel } from "ai"
import { generateText as vercelGenerateText } from "ai"

type GenerateTextOptions = {
  model: AIModel
  system: string
  messages: { role: string; content: string }[]
  temperature?: number
  max_tokens?: number
}

export async function generateText({ model, system, messages, temperature = 0.7, max_tokens }: GenerateTextOptions) {
  try {
    const request: AIChatRequest = {
      model,
      messages: [
        { role: "system", content: system },
        ...messages,
      ],
      temperature,
      max_tokens,
    }
    
    const response = await vercelGenerateText(request)
    
    return {
      text: response.content,
      model: response.model,
      id: response.id,
    }
  } catch (error) {
    console.error("[generate-text] Error:", error instanceof Error ? error.message : String(error))
    throw error
  }
}
