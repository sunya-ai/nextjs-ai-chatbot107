import { type Message, createDataStreamResponse, streamText } from "ai"
import { auth } from "@/app/(auth)/auth"
import { openai } from "@ai-sdk/openai"
import { systemPrompt, sheetPrompt } from "@/lib/ai/prompts"
import { deleteChatById, getChatById, saveChat, saveMessages } from "@/lib/db/queries"
import { generateUUID, getMostRecentUserMessage } from "@/lib/utils"
import { generateTitleFromUserMessage } from "@/app/(chat)/actions"
import { createDocument } from "@/lib/ai/tools/create-document"
import { updateDocument } from "@/lib/ai/tools/update-document"
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions"
import { getWeather } from "@/lib/ai/tools/get-weather"
import { createAssistantsEnhancer } from "@/lib/ai/enhancers/assistants"
import { compile } from "@mdx-js/mdx"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import rehypeRaw from "rehype-raw"
import { put } from "@vercel/blob"
import type { ArtifactKind } from "@/components/artifact"
import type { CustomMessage } from "@/lib/types"
import { generateText } from "@/lib/ai/generate-text"

export const maxDuration = 30

type Metadata = {
  isArtifact: boolean
  kind: ArtifactKind
  fileUrl?: string
}

type RateLimitInfo = {
  shortTermCount: number
  shortTermResetTime: number
  longTermCount: number
  longTermResetTime: number
}

const requestsMap = new Map<string, RateLimitInfo>()

const SHORT_MAX_REQUESTS = 50
const SHORT_WINDOW_TIME = 2 * 60 * 60_000
const LONG_MAX_REQUESTS = 100
const LONG_WINDOW_TIME = 12 * 60 * 60_000

function rateLimiter(userId: string): boolean {
  const now = Date.now()
  let userData = requestsMap.get(userId)

  if (!userData) {
    userData = {
      shortTermCount: 0,
      shortTermResetTime: now + SHORT_WINDOW_TIME,
      longTermCount: 0,
      longTermResetTime: now + LONG_WINDOW_TIME,
    }
  }

  if (now > userData.shortTermResetTime) {
    userData.shortTermCount = 0
    userData.shortTermResetTime = now + SHORT_WINDOW_TIME
  }
  if (userData.shortTermCount >= SHORT_MAX_REQUESTS) {
    console.log("[route] Rate limiter: Over short-term limit for user:", userId)
    return false
  }

  if (now > userData.longTermResetTime) {
    userData.longTermCount = 0
    userData.longTermResetTime = now + LONG_WINDOW_TIME
  }
  if (userData.longTermCount >= LONG_MAX_REQUESTS) {
    console.log("[route] Rate limiter: Over long-term limit for user:", userId)
    return false
  }

  userData.shortTermCount++
  userData.longTermCount++
  requestsMap.set(userId, userData)
  console.log("[route] Rate limiter: Allowed request for user:", userId)
  return true
}

const assistantsEnhancer = createAssistantsEnhancer(process.env.OPENAI_ASSISTANT_ID || "default-assistant-id")

function convertContentToString(content: any): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item
        if (item && typeof item.text === "string") return item.text
        return ""
      })
      .join("")
  }
  return ""
}

function extractSources(message: CustomMessage | null): Array<{ title: string; url: string }> {
  if (!message) return []

  // Direct sources property
  if (message.sources) {
    return message.sources
      .map((source) => ({
        title: source.title || "Unknown Source",
        url: source.url || "",
      }))
      .filter((source) => source.url)
  }

  // Extract from parts if available
  if (message.parts) {
    const sourceParts: Array<{ title: string; url: string }> = []

    // Use a for loop with explicit checking for type safety
    for (const part of message.parts) {
      if (part.type === "source" && "source" in part && part.source) {
        sourceParts.push({
          title: part.source.title || "Unknown Source",
          url: part.source.url || "",
        })
      }
    }

    return sourceParts.filter((source) => source.url)
  }

  return []
}

function extractReasoning(message: CustomMessage | null): string[] {
  if (!message) return []

  if (message.reasoning) {
    return Array.isArray(message.reasoning) ? message.reasoning : [message.reasoning]
  }

  if (message.parts) {
    const reasoningTexts: string[] = []

    for (const part of message.parts) {
      if (part.type === "reasoning") {
        if ("reasoning" in part && part.reasoning) {
          reasoningTexts.push(part.reasoning)
        } else if ("details" in part && Array.isArray(part.details)) {
          for (const detail of part.details) {
            if (detail.type === "text" && detail.text) {
              reasoningTexts.push(detail.text)
            }
          }
        }
      }
    }

    return reasoningTexts
  }

  return []
}

async function needsNewSearch(
  message: string | any[],
  previousMessages: CustomMessage[],
  previousContext: { text: string; reasoning: string[]; sources: { title: string; url: string }[] },
): Promise<{ needsSearch: boolean; text: string; reasoning: string[]; sources: { title: string; url: string }[] }> {
  const messageContent = Array.isArray(message)
    ? message.map((m) => (typeof m === "string" ? m : m.text || "")).join(" ")
    : message

  console.log(
    "[route] Starting new search check with Gemini Flash 2.0 for message (first 100 chars):",
    messageContent.slice(0, 100),
  )

  const searchPrompt = `
You are an energy research query classifier. Determine if the user's message requires a new web/RAG search based on the conversation history and previous context. A new search is needed if:
- The message introduces new standalone information or requires updated energy sector data.
- The message cannot be answered using existing chat history, previous context, or the final model's knowledge.
- The message is not brief, context-dependent, or directly related to prior queries.

Previous messages: ${JSON.stringify(previousMessages)}
Previous context: ${JSON.stringify(previousContext)}
Current message: ${messageContent}

Format your response as:
- needsSearch: [true/false]
- Text: [refined query or context, if new search needed; original query, if not]
- Reasoning: [step-by-step reasoning for the decision]
- Sources: [list of relevant sources with titles and URLs, if any]
`

  try {
    const result = await generateText({
      model: openai("gpt-3.5-turbo"), //using openai model for testing purposes.  Replace with appropriate model if needed.
      system: searchPrompt,
      messages: [{ role: "user", content: messageContent }],
    })

    const responseText = result.text
    const needsSearchMatch = responseText.match(/needsSearch:\s*(true|false)/i)
    const needsSearch = needsSearchMatch ? needsSearchMatch[1].toLowerCase() === "true" : true

    const textMatch = responseText.match(/Text:\s*([^\n]+)/i)
    const text = textMatch ? textMatch[1].trim() : messageContent

    const reasoningRegex = /Reasoning:\s*([\s\S]*?)(?=Sources:|$)/i
    const reasoningMatch = responseText.match(reasoningRegex)
    const reasoning = reasoningMatch
      ? reasoningMatch[1]
          .trim()
          .split("\n")
          .map((line: string) => line.trim())
          .filter(Boolean)
      : []

    const sourcesRegex = /Sources:\s*([\s\S]*?)$/i
    const sourcesMatch = responseText.match(sourcesRegex)
    let sources: { title: string; url: string }[] = []

    if (sourcesMatch && sourcesMatch[1]) {
      const sourcesText = sourcesMatch[1].trim()
      const urlMatches = [...sourcesText.matchAll(/\[([^\]]+)\]$$(https?:\/\/[^)]+)$$/g)]
      sources = urlMatches.map((match) => ({
        title: match[1] || "Unknown Source",
        url: match[2],
      }))
    }

    console.log("[route] New search check completed, needsSearch:", needsSearch)
    return { needsSearch, text, reasoning, sources }
  } catch (error) {
    console.error("[route] New search check error:", error instanceof Error ? error.message : String(error))
    return { needsSearch: true, text: messageContent, reasoning: [], sources: [] }
  }
}

async function processSpreadsheetUpdate(messages: CustomMessage[], currentData?: any): Promise<any> {
  const userMessage = getMostRecentUserMessage(messages)

  if (!userMessage) return currentData || [["Date", "Deal Type", "Amount"]]

  console.log("[route] Processing spreadsheet update for message (first 100 chars):", userMessage.content.slice(0, 100))

  const spreadsheetPromptText = sheetPrompt
  try {
    const result = await generateText({
      model: openai("gpt-3.5-turbo"), //using openai model for testing purposes. Replace with appropriate model if needed.
      system: spreadsheetPromptText,
      messages: [
        {
          role: "user",
          content: typeof userMessage.content === "string" ? userMessage.content : JSON.stringify(userMessage.content),
        },
      ],
    })

    try {
      const parsedData = JSON.parse(result.text)
      if (Array.isArray(parsedData)) {
        console.log("[route] Spreadsheet update completed, data length:", parsedData.length)
        if (parsedData.length < 20) {
          console.warn("[route] Spreadsheet has fewer than 20 rows, adding note")
          parsedData.push(["Note", "Insufficient data", "", "", "", "[No provided URL]"])
        }
        return parsedData
      }
    } catch (e) {
      console.error("[route] Failed to parse spreadsheet data:", e instanceof Error ? e.message : String(e))
    }

    return currentData || [["Date", "Deal Type", "Amount"]]
  } catch (error) {
    console.error("[route] Spreadsheet update error:", error instanceof Error ? error.message : String(error))
    return currentData || [["Date", "Deal Type", "Amount"]]
  }
}

function getFinalModel(selectedModel: string) {
  if (selectedModel.startsWith("openai")) {
    return openai(selectedModel.replace('openai("', "").replace('")', ""))
  } else if (selectedModel.startsWith("google")) {
    //Handle Google models here if needed.  Replace with appropriate logic.
    return openai("gpt-3.5-turbo")
  }
  return openai("gpt-3.5-turbo") // Default to OpenAI model
}

export const runtime = "edge"

export async function POST(request: Request) {
  console.log("[route] POST request received at /api/chat, time:", new Date().toISOString())
  try {
    const session = await auth()
    if (!session?.user?.id) {
      console.log("[route] Unauthorized request => 401")
      return new Response("Unauthorized", { status: 401 })
    }

    console.log("[route] User authenticated, userId:", session.user.id)

    if (!rateLimiter(session.user.id)) {
      console.log("[route] Rate limit exceeded for user:", session.user.id)
      return new Response("Too Many Requests", { status: 429 })
    }

    const body = await request.json()
    console.log("[route] Request body parsed:", JSON.stringify(body, null, 2))

    const messages: CustomMessage[] = Array.isArray(body.messages) ? body.messages : []
    const id = body.id || generateUUID()
    const selectedChatModel = body.selectedChatModel || 'openai("gpt-3.5-turbo")' // Default to OpenAI model
    const file = body.file || null
    const currentData = body.currentData

    if (messages.length === 0) {
      console.log("[route] Empty messages, returning welcome message")
      return new Response(
        JSON.stringify({
          messages: [
            {
              id: generateUUID(),
              role: "assistant",
              content: "Welcome! How can I assist you today?",
              sources: [],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    const userMessage = getMostRecentUserMessage(messages)
    if (!userMessage) {
      console.log("[route] No user message found => 400")
      return new Response("No user message found", { status: 400 })
    }

    console.log(
      "[route] Processing user message (first 100 chars):",
      typeof userMessage.content === "string"
        ? userMessage.content.slice(0, 100)
        : JSON.stringify(userMessage.content).slice(0, 100),
    )

    const content = (() => {
      if (typeof userMessage.content === "string") {
        return userMessage.content.toLowerCase()
      }
      if (Array.isArray(userMessage.content)) {
        return (userMessage.content as (string | { text?: string })[])
          .map((item) => {
            if (typeof item === "string") {
              return item.toLowerCase()
            }
            if (typeof item === "object" && item !== null && typeof item.text === "string") {
              return item.text.toLowerCase()
            }
            return ""
          })
          .join(" ")
      }
      return ""
    })()

    const isSpreadsheetUpdate = content.includes("add") && (content.includes("deal") || content.includes("spreadsheet"))

    const userMessageFromMessagesArray = messages[messages.length - 1]

    if (userMessageFromMessagesArray.role !== "user") {
      return new Response("Invalid request", { status: 400 })
    }

    if (isSpreadsheetUpdate) {
      console.log("[route] Detected spreadsheet update request")
      const updatedSpreadsheet = await processSpreadsheetUpdate(messages, currentData)
      const blob = await put(`spreadsheets/${generateUUID()}.csv`, JSON.stringify(updatedSpreadsheet), {
        access: "public",
      })
      console.log("[route] Spreadsheet updated, blob URL:", blob.url)
      return new Response(JSON.stringify({ updatedData: { fileUrl: blob.url } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    const chat = await getChatById(id)
    if (!chat) {
      console.log("[route] No chat found, creating new chat with ID:", id)
      const title = await generateTitleFromUserMessage({ message: userMessage as Message })
      await saveChat({ id, userId: session.user.id, title: title || "New Chat" })
    }

    console.log("[route] Saving user message to DB for chat:", id)
    await saveMessages({
      messages: [
        {
          id: userMessage.id,
          chatId: id,
          role: userMessage.role,
          content: userMessage.content,
          createdAt: new Date(),
          metadata: null,
          // FIX: Correctly handling reasoning with proper type narrowing
          reasoning: Array.isArray(userMessage.reasoning) 
            ? (userMessage.reasoning.length > 0 ? userMessage.reasoning[0] : undefined)
            : (typeof userMessage.reasoning === 'string' ? userMessage.reasoning : undefined),
          sources: Array.isArray(userMessage.sources) ? userMessage.sources : [],
        },
      ],
    })

    let fileBuffer: ArrayBuffer | undefined
    let fileMime: string | undefined
    if (file) {
      console.log("[route] File detected, processing...")
      if (typeof file === "string") {
        const binaryString = atob(file.split(",")[1])
        fileBuffer = new ArrayBuffer(binaryString.length)
        const uint8Array = new Uint8Array(fileBuffer)
        for (let i = 0; i < binaryString.length; i++) {
          uint8Array[i] = binaryString.charCodeAt(i)
        }
        fileMime = file.split(";")[0].split(":")[1] || "application/octet-stream"
      } else if (file instanceof ArrayBuffer) {
        fileBuffer = file
        fileMime = "application/octet-stream"
      }
      console.log("[route] File processed, mime:", fileMime)
    }

    console.log("[route] => createDataStreamResponse => multi-pass with bypass, time:", new Date().toISOString())
    return createDataStreamResponse({
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      execute: async (dataStream) => {
        try {
          console.log("[route] Checking if message is a follow-up or needs new search...")
          const previousMessages = messages.slice(0, -1) as CustomMessage[]
          const previousResponse = messages[messages.length - 2] as CustomMessage | undefined

          const previousContext = previousResponse
            ? {
                text: convertContentToString(previousResponse.content),
                reasoning: extractReasoning(previousResponse),
                sources: extractSources(previousResponse),
              }
            : { text: "", reasoning: [], sources: [] }

          const {
            needsSearch,
            text: refinedText,
            reasoning: followUpReasoning,
            sources: followUpSources,
          } = await needsNewSearch(userMessage.content, previousMessages, previousContext)

          if (!needsSearch) {
            console.log("[route] No new search needed, using existing context for follow-up")
            const finalPrompt = `Context: (Follow-up question)\nPrevious Context: ${previousContext.text}\nQuery: ${refinedText}`
            const finalModel = getFinalModel(selectedChatModel)

            console.log("[route] Streaming follow-up response with model:", selectedChatModel)
            const result = await streamText({
              model: finalModel,
              system: systemPrompt({ selectedChatModel }),
              messages: [{ role: "user", content: finalPrompt }],
              tools: {
                getWeather,
                createDocument: createDocument({ session, dataStream }),
                updateDocument: updateDocument({ session, dataStream }),
                requestSuggestions: requestSuggestions({ session, dataStream }),
              },
              onFinish: async ({ response }) => {
                const assistantMessage = response.messages.find((m) => m.role === "assistant")
                if (assistantMessage) {
                  let content = convertContentToString(assistantMessage.content)
                  let metadata: Metadata | null = null
                  const sources = followUpSources ?? []
                  // FIX: Properly extract first item from reasoning array
                  const reasoning = followUpReasoning.length > 0 ? followUpReasoning[0] : undefined

                  console.log("[route] Processing final response for follow-up, content length:", content.length)
                  try {
                    const parsedContent = JSON.parse(content)
                    if (Array.isArray(parsedContent)) {
                      content = JSON.stringify(parsedContent)
                      metadata = {
                        isArtifact: true,
                        kind: Array.isArray(parsedContent[0]) ? "sheet" : "text",
                      }
                      if (metadata.kind === "sheet") {
                        const blob = await put(`artifacts/${generateUUID()}.csv`, content, {
                          access: "public",
                        })
                        metadata.fileUrl = blob.url
                        content = JSON.stringify({ message: "Artifact generated", fileUrl: blob.url })
                        console.log("[route] Artifact generated for follow-up, blob URL:", blob.url)
                      }
                    } else {
                      const compiledMdx = await compile(content, {
                        outputFormat: "function-body",
                        remarkPlugins: [remarkGfm],
                        rehypePlugins: [rehypeHighlight, rehypeRaw],
                      })
                      content = compiledMdx.toString()
                    }
                  } catch (e) {
                    console.error(
                      "[route] MDX compilation error for follow-up:",
                      e instanceof Error ? e.message : String(e),
                    )
                    const compiledMdx = await compile(content, {
                      outputFormat: "function-body",
                      remarkPlugins: [remarkGfm],
                      rehypePlugins: [rehypeHighlight, rehypeRaw],
                    })
                    content = compiledMdx.toString()
                  }

                  console.log("[route] Saving follow-up response to DB")
                  await saveMessages({
                    messages: [
                      {
                        id: generateUUID(),
                        chatId: id,
                        role: "assistant",
                        content,
                        createdAt: new Date(),
                        metadata,
                        reasoning,
                        sources,
                      },
                    ],
                  })
                }
              },
            })

            await result.mergeIntoDataStream(dataStream, {
              sendReasoning: true,
              sendSources: true,
            })
          } else {
            console.log("[route] New search needed, running full context enhancement")
            console.log(
              "[route] Enhancing context with assistantsEnhancer for message:",
              userMessage.content.slice(0, 100),
            )
            const {
              text: finalContext,
              reasoning: combinedReasoning,
              sources: combinedSources,
            } = await assistantsEnhancer(userMessage.content, fileBuffer, fileMime)

            const finalPrompt = `Context:\n${finalContext}\n\nQuery: ${userMessage.content}`
            const finalModel = getFinalModel(selectedChatModel)

            console.log("[route] Streaming full response with model:", selectedChatModel)
            const result = await streamText({
              model: finalModel,
              system: systemPrompt({ selectedChatModel }),
              messages: [{ role: "user", content: finalPrompt }],
              tools: {
                getWeather,
                createDocument: createDocument({ session, dataStream }),
                updateDocument: updateDocument({ session, dataStream }),
                requestSuggestions: requestSuggestions({ session, dataStream }),
              },
              onFinish: async ({ response }) => {
                const assistantMessage = response.messages.find((m) => m.role === "assistant")
                if (assistantMessage) {
                  let content = convertContentToString(assistantMessage.content)
                  let metadata: Metadata | null = null
                  const sources = combinedSources ?? []
                  // FIX: Properly extract first item from reasoning array
                  const reasoning = combinedReasoning.length > 0 ? combinedReasoning[0] : undefined

                  console.log("[route] Processing final response for full process, content length:", content.length)
                  try {
                    const parsedContent = JSON.parse(content)
                    if (Array.isArray(parsedContent)) {
                      content = JSON.stringify(parsedContent)
                      metadata = {
                        isArtifact: true,
                        kind: Array.isArray(parsedContent[0]) ? "sheet" : "text",
                      }
                      if (metadata.kind === "sheet") {
                        const blob = await put(`artifacts/${generateUUID()}.csv`, content, {
                          access: "public",
                        })
                        metadata.fileUrl = blob.url
                        content = JSON.stringify({ message: "Artifact generated", fileUrl: blob.url })
                        console.log("[route] Artifact generated for full process, blob URL:", blob.url)
                      }
                    } else {
                      const compiledMdx = await compile(content, {
                        outputFormat: "function-body",
                        remarkPlugins: [remarkGfm],
                        rehypePlugins: [rehypeHighlight, rehypeRaw],
                      })
                      content = compiledMdx.toString()
                    }
                  } catch (e) {
                    console.error(
                      "[route] MDX compilation error for full process:",
                      e instanceof Error ? e.message : String(e),
                    )
                    const compiledMdx = await compile(content, {
                      outputFormat: "function-body",
                      remarkPlugins: [remarkGfm],
                      rehypePlugins: [rehypeHighlight, rehypeRaw],
                    })
                    content = compiledMdx.toString()
                  }

                  console.log("[route] Saving full response to DB")
                  await saveMessages({
                    messages: [
                      {
                        id: generateUUID(),
                        chatId: id,
                        role: "assistant",
                        content,
                        createdAt: new Date(),
                        metadata,
                        reasoning,
                        sources,
                      },
                    ],
                  })
                }
              },
            })

            await result.mergeIntoDataStream(dataStream, {
              sendReasoning: true,
              sendSources: true,
            })
          }
        } catch (err) {
          console.error("[route] Error during processing:", err instanceof Error ? err.message : String(err))
          throw err
        }
      },
      onError: (error) => {
        console.error("[route] Final error handler:", error instanceof Error ? error.message : String(error))
        return "Internal Server Error"
      },
    })
  } catch (error: unknown) {
    console.error("[route] Error in POST handler:", error instanceof Error ? error.message : String(error))
    const message =
      error instanceof Error && error.message.includes("file") ? "File processing failed" : "Internal Server Error"
    return new Response(message, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  console.log("[route] DELETE request received at /api/chat, time:", new Date().toISOString())
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    console.log("[route] No chat ID provided => 404")
    return new Response("Not Found", { status: 404 })
  }

  const session = await auth()
  if (!session?.user) {
    console.log("[route] Unauthorized DELETE request => 401")
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    console.log("[route] Checking chat with ID:", id)
    const chat = await getChatById(id)
    if (!chat || chat.userId !== session.user.id) {
      console.log("[route] Chat not found or not owned => 401")
      return new Response("Unauthorized", { status: 401 })
    }

    console.log("[route] Deleting chat with ID:", id)
    await deleteChatById(id)
    return new Response("Chat deleted", { status: 200 })
  } catch (error) {
    console.error("[route] Error during DELETE:", error instanceof Error ? error.message : String(error))
    return new Response("An error occurred while processing your request", {
      status: 500,
    })
  }
}
