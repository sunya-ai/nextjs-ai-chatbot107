import type { AIChatRequest, AIModel } from "ai"
import { generateText as vercelGenerateText } from "ai"

type GenerateTextOptions = {
  model: AIModel
  system: string
  messages: { role: string; content: string }[]
  temperature?: number
  max_tokens?: number
  seed?: number
  top_p?: number
  n?: number
  functions?: any[]
  function_call?: any
}

export async function generateText({ 
  model, 
  system, 
  messages, 
  temperature = 0.7, 
  max_tokens,
  seed,
  top_p,
  n,
  functions,
  function_call
}: GenerateTextOptions) {
  try {
    const request: AIChatRequest = {
      model,
      messages: [
        { role: "system", content: system },
        ...messages,
      ],
      temperature,
      max_tokens,
      seed,
      top_p,
      n,
      functions,
      function_call
    }
    
    const response = await vercelGenerateText(request)
    
    return {
      text: response.content,
      model: response.model,
      id: response.id,
      usage: response.usage
    }
  } catch (error) {
    console.error("[generate-text] Error:", error instanceof Error ? error.message : String(error))
    throw error
  }
}
