import { extractUserContentParts } from "coding-agent/attached-files";

export interface RequestMessage {
  id?: string;
  role: string;
  content?: unknown;
  toolCalls?: unknown;
  toolCallId?: string;
  name?: string;
}

// Extracts the typed text from a client message's content, which is either
// a plain string or an AG-UI `InputContent[]` (text/image/document parts,
// present when the message carries attachments).
export function promptTextFromContent(content: unknown): string {
  return extractUserContentParts(content).text;
}

// The worker only reads the last client message's content (see
// startPromptCollector in packages/coding-agent/src/session-manager.ts) —
// earlier messages are forwarded solely to help it stay in sync, never
// parsed for attachments. Blanking out their base64 payloads avoids
// re-shipping the whole attachment history to the worker on every turn.
export function stripNonTailAttachmentData(
  messages: RequestMessage[],
): RequestMessage[] {
  if (messages.length === 0) return messages;
  const lastIndex = messages.length - 1;
  return messages.map((message, index) => {
    if (index === lastIndex || !Array.isArray(message.content)) return message;
    const content = (message.content as Array<Record<string, unknown>>).map(
      (part) => {
        const source = part?.source as
          | { type?: string; value?: unknown }
          | undefined;
        if (part?.type !== "text" && source?.type === "data") {
          return { ...part, source: { ...source, value: "" } };
        }
        return part;
      },
    );
    return { ...message, content };
  });
}
