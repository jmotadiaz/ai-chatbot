import { randomUUID } from "crypto"
import type { TranscriptMessage, ToolCallRecord, SourceRecord } from "./types"
import type { createTraceWriter } from "./trace-writer"

interface ChatbotClientOptions {
  baseUrl: string
  cookie: string
  model: string
  traceWriter?: ReturnType<typeof createTraceWriter>
}

interface StreamResult {
  textContent: string
  chatId: string | undefined
  toolCalls: ToolCallRecord[]
  sources: SourceRecord[]
  reasoning: string
  usage: { inputTokens: number; outputTokens: number }
}

export function createChatbotClient(options: ChatbotClientOptions) {
  const { baseUrl, cookie, model, traceWriter } = options

  return {
    async sendMessage(
      messages: TranscriptMessage[],
      existingChatId?: string,
    ): Promise<StreamResult & { message: TranscriptMessage }> {
      const body = {
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          parts: [{ type: "text", text: m.content }],
        })),
        selectedModel: model,
        chatId: existingChatId,
        agent: "context7",
      }

      const startTime = performance.now()
      const maxRetries = 3
      let response: Response | undefined

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          response = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: cookie,
            },
            body: JSON.stringify(body),
          })
          break
        } catch (err) {
          if (attempt < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
            continue
          }
          throw err
        }
      }

      if (!response) {
        throw new Error("Chat API unreachable after retries")
      }

      const traceRunId = response.headers.get("X-Trace-Run-Id") ?? undefined
      const traceRequestId =
        response.headers.get("X-Trace-Request-Id") ?? undefined

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Chat API returned ${response.status}: ${errorText.slice(0, 500)}`,
        )
      }

      const result = await parseStream(response)
      const durationMs = Math.round(performance.now() - startTime)
      const messageId = randomUUID()

      if (traceWriter) {
        const lastUserMsg = messages[messages.length - 1]
        traceWriter.addTrace({
          type: "chatbot",
          input: lastUserMsg?.content ?? "",
          output: result.textContent,
          tokens: {
            input: result.usage.inputTokens,
            output: result.usage.outputTokens,
          },
          duration_ms: durationMs,
          metadata: {
            chatId: result.chatId,
            toolCalls: result.toolCalls.length,
            sources: result.sources.length,
            traceRunId,
            traceRequestId,
          },
        })
      }

      return {
        ...result,
        message: {
          id: messageId,
          role: "assistant",
          content: result.textContent,
          timestamp: new Date().toISOString(),
          toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
          reasoning: result.reasoning || undefined,
          sources: result.sources.length > 0 ? result.sources : undefined,
        },
      }
    },
  }
}

async function parseStream(response: Response): Promise<StreamResult> {
  if (!response.body) throw new Error("Response body is not readable")

  const result: StreamResult = {
    textContent: "",
    chatId: undefined,
    toolCalls: [],
    sources: [],
    reasoning: "",
    usage: { inputTokens: 0, outputTokens: 0 },
  }

  const pendingText: Map<string, string> = new Map()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let sseBuffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      processRemainingBuffer(sseBuffer, result, pendingText)
      break
    }

    sseBuffer += decoder.decode(value, { stream: true })

    const events = sseBuffer.split(/\n\n/)
    sseBuffer = events.pop() ?? ""

    for (const event of events) {
      processEvent(event, result, pendingText)
    }
  }

  return result
}

function processRemainingBuffer(
  buffer: string,
  result: StreamResult,
  pendingText: Map<string, string>,
) {
  const trimmed = buffer.trim()
  if (!trimmed || trimmed === "data: [DONE]") return
  processEvent(trimmed, result, pendingText)
}

function processEvent(
  event: string,
  result: StreamResult,
  pendingText: Map<string, string>,
) {
  const trimmed = event.trim()
  if (!trimmed || trimmed === "data: [DONE]") return

  const dataMatch = trimmed.match(/^data: ([\s\S]+)/)
  if (!dataMatch) return

  try {
    const chunk = JSON.parse(dataMatch[1])
    const type = chunk.type as string

    switch (type) {
      case "text-start": {
        pendingText.set(chunk.id, "")
        break
      }
      case "text-delta": {
        const current = pendingText.get(chunk.id) ?? ""
        pendingText.set(chunk.id, current + (chunk.delta ?? ""))
        break
      }
      case "text-end": {
        const text = pendingText.get(chunk.id) ?? ""
        if (text) result.textContent += text
        pendingText.delete(chunk.id)
        break
      }
      case "data-chat": {
        if (chunk.data?.id) {
          result.chatId = chunk.data.id
        }
        break
      }
      case "data-usage": {
        result.usage = {
          inputTokens:
            typeof chunk.data?.inputTokens === "number"
              ? chunk.data.inputTokens
              : 0,
          outputTokens:
            typeof chunk.data?.outputTokens === "number"
              ? chunk.data.outputTokens
              : 0,
        }
        break
      }
      case "tool-input-available": {
        result.toolCalls.push({
          toolName: chunk.toolName ?? "unknown",
          input: chunk.input,
          toolCallId: chunk.toolCallId ?? "",
        })
        break
      }
      case "tool-output-available": {
        const tc = result.toolCalls.find(
          (t) => t.toolCallId === chunk.toolCallId,
        )
        if (tc) {
          tc.output =
            typeof chunk.output === "string"
              ? chunk.output.slice(0, 500)
              : JSON.stringify(chunk.output).slice(0, 500)
        }
        break
      }
      case "source-url": {
        result.sources.push({
          url: chunk.url ?? "",
          title: chunk.title,
        })
        break
      }
    }
  } catch {
    // skip unparseable lines
  }
}
