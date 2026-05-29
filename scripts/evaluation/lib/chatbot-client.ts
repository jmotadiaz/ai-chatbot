import { randomUUID } from "crypto";
import type { TranscriptMessage, ToolCallRecord, SourceRecord } from "./types";
import { colors } from "./colors";

interface ChatbotClientOptions {
  baseUrl: string;
  cookie: string;
  model: string;
}

interface StreamResult {
  textContent: string;
  chatId: string | undefined;
  toolCalls: ToolCallRecord[];
  sources: SourceRecord[];
  reasoning: string;
  usage: { inputTokens: number; outputTokens: number };
  rawChunks: unknown[];
}

export function createChatbotClient(options: ChatbotClientOptions) {
  const { baseUrl, cookie, model } = options;

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
      };

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Chat API returned ${response.status}: ${errorText.slice(0, 500)}`,
        );
      }

      const result = await parseStream(response);
      const messageId = randomUUID();

      process.stdout.write("\n");

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
      };
    },
  };
}

async function parseStream(
  response: Response,
): Promise<StreamResult> {
  if (!response.body) throw new Error("Response body is not readable");

  const result: StreamResult = {
    textContent: "",
    chatId: undefined,
    toolCalls: [],
    sources: [],
    reasoning: "",
    usage: { inputTokens: 0, outputTokens: 0 },
    rawChunks: [],
  };

  const pendingText: Map<string, string> = new Map();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      processRemainingBuffer(sseBuffer, result, pendingText);
      break;
    }

    sseBuffer += decoder.decode(value, { stream: true });

    const events = sseBuffer.split(/\n\n/);
    sseBuffer = events.pop() ?? "";

    for (const event of events) {
      processEvent(event, result, pendingText);
    }
  }

  return result;
}

function processRemainingBuffer(
  buffer: string,
  result: StreamResult,
  pendingText: Map<string, string>,
) {
  const trimmed = buffer.trim();
  if (!trimmed || trimmed === "data: [DONE]") return;
  processEvent(trimmed, result, pendingText);
}

function processEvent(
  event: string,
  result: StreamResult,
  pendingText: Map<string, string>,
) {
  const trimmed = event.trim();
  if (!trimmed || trimmed === "data: [DONE]") return;

  const dataMatch = trimmed.match(/^data: ([\s\S]+)/);
  if (!dataMatch) return;

  try {
    const chunk = JSON.parse(dataMatch[1]);
    result.rawChunks.push(chunk);

    const type = chunk.type as string;

    switch (type) {
      case "text-start": {
        pendingText.set(chunk.id, "");
        break;
      }
      case "text-delta": {
        const current = pendingText.get(chunk.id) ?? "";
        const updated = current + (chunk.delta ?? "");
        pendingText.set(chunk.id, updated);
        process.stdout.write(colors.assistant(chunk.delta ?? ""));
        break;
      }
      case "text-end": {
        const text = pendingText.get(chunk.id) ?? "";
        if (text) result.textContent += text;
        pendingText.delete(chunk.id);
        break;
      }
      case "data-chat": {
        if (chunk.data?.id) {
          result.chatId = chunk.data.id;
        }
        break;
      }
      case "data-usage": {
        result.usage = {
          inputTokens: typeof chunk.data?.inputTokens === "number" ? chunk.data.inputTokens : 0,
          outputTokens: typeof chunk.data?.outputTokens === "number" ? chunk.data.outputTokens : 0,
        };
        break;
      }
      case "tool-input-start": {
        break;
      }
      case "tool-input-delta": {
        break;
      }
      case "tool-input-available": {
        result.toolCalls.push({
          toolName: chunk.toolName ?? "unknown",
          input: chunk.input,
          toolCallId: chunk.toolCallId ?? "",
        });
        break;
      }
      case "tool-output-available": {
        const tc = result.toolCalls.find(
          (t) => t.toolCallId === chunk.toolCallId,
        );
        if (tc) {
          tc.output = typeof chunk.output === "string"
            ? chunk.output.slice(0, 500)
            : JSON.stringify(chunk.output).slice(0, 500);
        }
        break;
      }
      case "tool-error": {
        break;
      }
      case "source-url": {
        result.sources.push({
          url: chunk.url ?? "",
          title: chunk.title,
        });
        break;
      }
      case "reasoning-start":
      case "reasoning-delta":
      case "reasoning-end": {
        break;
      }
      case "finish": {
        break;
      }
    }
  } catch {
    // skip unparseable lines
  }
}
