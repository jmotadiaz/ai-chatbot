import { randomUUID } from "crypto"
import { generateText } from "ai"
import type { ModelId } from "models"
import type { TranscriptMessage } from "./types"
import type { createTraceWriter } from "./trace-writer"
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit"

interface SimulatorOptions {
  /** A Model Catalog id — resolved through the kit, never a raw provider/model pair. */
  modelKey: ModelId
  scenarioPrompt: string
  traceWriter?: ReturnType<typeof createTraceWriter>
}

function extractText(
  result: Awaited<ReturnType<typeof generateText>>,
): string {
  const text = result.text?.trim() ?? ""

  if (text) return text

  const textParts = result.content
    ?.filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("")

  return (textParts ?? "").trim()
}

export function createSimulator(options: SimulatorOptions) {
  const { scenarioPrompt, modelKey, traceWriter } = options

  // Resolved by catalog id through the kit — no provider/model literal here;
  // `languageModel` itself throws if `modelKey` is not in `MODEL_CATALOG`.
  const modelFactory = () => inferenceKit.languageModel(modelKey).model

  return {
    async generateNextMessage(
      history: TranscriptMessage[],
      _messageIndex: number,
    ): Promise<TranscriptMessage> {
      const historyText = formatHistory(history)

      const prompt = `${scenarioPrompt}

## Conversation so far
${historyText || "(This is the first message — start the conversation)"}

Respond ONLY with the next user message. Do NOT include any meta-commentary, role labels, or formatting. Just write the message content as if you were a user chatting with an AI assistant. Your message should feel natural and conversational.`

      const startTime = performance.now()
      const result = await generateText({
        model: modelFactory(),
        prompt,
        temperature: 0.9,
      })
      const durationMs = Math.round(performance.now() - startTime)

      const content = extractText(result)
        .replace(/^(User:|Human:)\s*/i, "")
        .trim()

      if (traceWriter) {
        traceWriter.addTrace({
          type: "simulator",
          input: prompt.slice(0, 500),
          output: content,
          tokens: {
            input: result.usage?.inputTokens ?? 0,
            output: result.usage?.outputTokens ?? 0,
          },
          duration_ms: durationMs,
        })
      }

      return {
        id: randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      }
    },

    async generateMessageFromPrompt(
      prompt: string,
    ): Promise<TranscriptMessage> {
      const startTime = performance.now()
      const result = await generateText({
        model: modelFactory(),
        prompt,
        temperature: 0.9,
      })
      const durationMs = Math.round(performance.now() - startTime)

      const content = extractText(result)
        .replace(/^(User:|Human:)\s*/i, "")
        .trim()

      if (traceWriter) {
        traceWriter.addTrace({
          type: "simulator",
          input: prompt,
          output: content,
          tokens: {
            input: result.usage?.inputTokens ?? 0,
            output: result.usage?.outputTokens ?? 0,
          },
          duration_ms: durationMs,
        })
      }

      return {
        id: randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      }
    },
  }
}

function formatHistory(history: TranscriptMessage[]): string {
  return history
    .map((msg) => {
      const role = msg.role === "user" ? "User" : "Assistant"
      const content = msg.content.slice(0, 2000)
      return `${role}: ${content}`
    })
    .join("\n\n")
}
