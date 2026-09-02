import {
  assistantMessageId,
  reasoningMessageId,
  toolResultMessageId,
  userMessageId,
  IdDeduper,
} from "./message-ids";
import { splitAttachedFiles } from "../runtime/attached-files";

function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((c: unknown) => (c as { type?: string }).type === "text")
      .map((c: unknown) => (c as { text?: string }).text ?? "")
      .join("\n");
  }
  return "";
}

/**
 * Convert Pi session messages to AG-UI-shaped messages.
 *
 * Ids are derived deterministically from each Pi message's own data
 * (timestamp for user/assistant messages, real toolCallId for tool
 * results) so they match the ids the live translator assigns to the same
 * messages during streaming (see message-ids.ts). For a user message that
 * carries a `clientMessageId` (stamped in `startPromptCollector` on its
 * `message_end`), that id takes precedence over the derived timestamp id
 * so the message keeps the exact id the client originated it with. One
 * deduper is shared across the whole conversion so same-millisecond
 * collisions resolve the same way every time it runs. Used by both the
 * history load path and the run-start MESSAGES_SNAPSHOT so a message keeps
 * the same identity in every delivery channel.
 */
export function convertPiMessagesToAgui(piMessages: ReadonlyArray<any>): Array<any> {
  const result: Array<any> = [];
  const idDeduper = new IdDeduper();
  piMessages.forEach((msg) => {
    if (msg.role === "user") {
      const baseId =
        typeof msg.clientMessageId === "string" ? msg.clientMessageId : userMessageId(msg.timestamp);
      const id = idDeduper.dedupe(baseId);
      const rawText = typeof msg.content === "string" ? msg.content : extractMessageText(msg.content);
      const piImages = Array.isArray(msg.content)
        ? msg.content.filter((c: any) => c && c.type === "image")
        : [];
      const { text, docs } = splitAttachedFiles(rawText);
      const displayText = typeof msg.clientPromptText === "string" ? msg.clientPromptText : text;

      if (piImages.length === 0 && docs.length === 0) {
        result.push({ id, role: "user", content: displayText });
      } else {
        const parts: unknown[] = [];
        if (displayText.trim().length > 0) {
          parts.push({ type: "text", text: displayText });
        }
        for (const img of piImages) {
          parts.push({
            type: "image",
            source: { type: "data", value: img.data, mimeType: img.mimeType },
          });
        }
        for (const doc of docs) {
          parts.push({
            type: "document",
            source: {
              type: "data",
              value: Buffer.from(doc.content, "utf8").toString("base64"),
              mimeType: doc.mimeType,
            },
            metadata: { filename: doc.filename },
          });
        }
        result.push({ id, role: "user", content: parts });
      }
    } else if (msg.role === "assistant") {
      const id = idDeduper.dedupe(assistantMessageId(msg.timestamp));

      if (Array.isArray(msg.content)) {
        const thinking = msg.content
          .filter((c: any) => c.type === "thinking")
          .map((c: any) => c.thinking)
          .join("\n");
        if (thinking) {
          result.push({
            id: reasoningMessageId(id),
            role: "reasoning",
            content: thinking,
          });
        }
      }

      const toolCalls = Array.isArray(msg.content)
        ? msg.content
            .filter((c: any) => c.type === "toolCall")
            .map((tc: any) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
              },
            }))
        : undefined;

      const text = Array.isArray(msg.content)
        ? msg.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("\n")
        : typeof msg.content === "string"
          ? msg.content
          : "";

      result.push({
        id,
        role: "assistant",
        content: text,
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
      });
    } else if (msg.role === "toolResult") {
      result.push({
        id: toolResultMessageId(msg.toolCallId),
        role: "tool",
        toolCallId: msg.toolCallId,
        content: Array.isArray(msg.content)
          ? msg.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("\n")
          : typeof msg.content === "string"
            ? msg.content
            : "",
      });
    }
  });

  return result;
}
