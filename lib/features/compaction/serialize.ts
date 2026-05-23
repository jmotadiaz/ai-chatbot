import type { ChatbotMessage } from "@/lib/features/chat/types";

const TOOL_OUTPUT_MAX_CHARS = 2000;

export function serializeMessages(messages: ChatbotMessage[]): string {
  return messages
    .map((msg) => {
      const parts = msg.parts
        ?.map((part) => {
          switch (part.type) {
            case "text":
              return part.text;
            case "reasoning":
              return `[Reasoning] ${part.text}`;
            case "tool-rag":
            case "tool-webSearch":
            case "tool-urlContext":
            case "tool-queryDocs":
            case "tool-resolveLibraryId":
            case "dynamic-tool": {
              const toolName = part.type === "dynamic-tool" ? part.toolName : part.type.replace("tool-", "");
              const rawOutput = "output" in part ? part.output : undefined;
              const outputStr =
                rawOutput && typeof rawOutput === "string"
                  ? rawOutput.slice(0, TOOL_OUTPUT_MAX_CHARS)
                  : JSON.stringify(rawOutput ?? "").slice(
                      0,
                      TOOL_OUTPUT_MAX_CHARS,
                    );
              return `[Tool: ${toolName}]\n${outputStr}`;
            }
            case "file":
              return `[File: ${part.filename ?? "unknown"} (${part.mediaType})]`;
            case "source-url":
              return `[Source: ${part.url}]`;
            case "source-document":
              return `[Document: ${part.title}]`;
            default:
              return "";
          }
        })
        .filter(Boolean)
        .join("\n");

      return `${msg.role}: ${parts}`;
    })
    .join("\n\n");
}
