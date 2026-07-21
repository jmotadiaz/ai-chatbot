import type {
  DocumentInputContent,
  ImageInputContent,
  InputContent,
  TextInputContent,
} from "@ag-ui/client";
import type { FilePart } from "@/lib/features/attachment/types";
import type { ModelConfiguration } from "@/lib/features/foundation-model/types";

/** Anthropic's per-image limit; kept conservative for base64 transport. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_FILE_BYTES = 256 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 5;

/** Pi has no PDF support; images go through natively, no model gating needed. */
export const CODE_AGENT_SUPPORTED_FILES: Required<ModelConfiguration>["supportedFiles"] = [
  "img",
];

function base64FromUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function utf8FromBase64(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function stripDataUrlPrefix(dataUrl: string): { data: string; mimeType?: string } {
  const match = /^data:([^;]*);base64,([\s\S]*)$/.exec(dataUrl);
  return match ? { mimeType: match[1] || undefined, data: match[2]! } : { data: dataUrl };
}

// `metadata` is typed `unknown` by @ag-ui/core's schema, so property access
// needs an explicit narrowing helper rather than optional chaining.
function metadataFilename(metadata: unknown): string | undefined {
  if (metadata && typeof metadata === "object" && "filename" in metadata) {
    const value = (metadata as Record<string, unknown>).filename;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

/**
 * Builds the AG-UI user-message content for a coding-agent turn. Returns a
 * plain string when there are no attachments (preserving every existing
 * string-content code path); otherwise an `InputContent[]` with a text part
 * plus one image/document part per file. Images carry their data URL as a
 * base64 `data` source; text files (identified by `FilePart.textContent`)
 * are base64-encoded as a `document` part so they travel through the same
 * AG-UI content array — the worker inlines their text back into the prompt.
 */
export function buildUserContent(text: string, files: FilePart[]): string | InputContent[] {
  if (files.length === 0) {
    return text;
  }

  const parts: InputContent[] = [];
  if (text.trim().length > 0) {
    parts.push({ type: "text", text } satisfies TextInputContent);
  }

  for (const file of files) {
    if (file.textContent !== undefined) {
      parts.push({
        type: "document",
        source: {
          type: "data",
          value: base64FromUtf8(file.textContent),
          mimeType: file.mediaType || "text/plain",
        },
        metadata: { filename: file.filename },
      } satisfies DocumentInputContent);
      continue;
    }

    const { data, mimeType } = stripDataUrlPrefix(file.url);
    parts.push({
      type: "image",
      source: {
        type: "data",
        value: data,
        mimeType: file.mediaType || mimeType || "image/png",
      },
      metadata: { filename: file.filename },
    } satisfies ImageInputContent);
  }

  return parts;
}

/**
 * Inverse of `buildUserContent`, used to render a user message (live or
 * reloaded from a snapshot) back into `{text, files}` for `UserMessage`.
 */
export function contentToDisplay(content: unknown): { text: string; files: FilePart[] } {
  if (typeof content === "string") {
    return { text: content, files: [] };
  }
  if (!Array.isArray(content)) {
    return { text: "", files: [] };
  }

  let text = "";
  const files: FilePart[] = [];

  for (const raw of content) {
    const part = raw as InputContent;
    if (!part || typeof part !== "object") continue;

    switch (part.type) {
      case "text":
        text += (part as TextInputContent).text;
        break;
      case "image": {
        const image = part as ImageInputContent;
        const filename = metadataFilename(image.metadata) ?? "image";
        const url =
          image.source.type === "data"
            ? `data:${image.source.mimeType || "image/png"};base64,${image.source.value}`
            : image.source.value;
        files.push({
          type: "file",
          mediaType: image.source.mimeType || "image/png",
          url,
          filename,
        });
        break;
      }
      case "document": {
        const doc = part as DocumentInputContent;
        const filename = metadataFilename(doc.metadata) ?? "attachment.txt";
        files.push({
          type: "file",
          mediaType: doc.source.mimeType || "text/plain",
          url: "",
          filename,
          textContent:
            doc.source.type === "data" ? utf8FromBase64(doc.source.value) : undefined,
        });
        break;
      }
      default:
        break;
    }
  }

  return { text, files };
}

/** Typed-text length for trace logging, without stringifying attachments. */
export function contentTextLength(content: string | InputContent[]): number {
  if (typeof content === "string") return content.length;
  return content.reduce(
    (sum, part) => sum + (part.type === "text" ? (part as TextInputContent).text.length : 0),
    0,
  );
}

export function contentAttachmentCounts(
  content: string | InputContent[],
): { imageCount: number; documentCount: number } {
  if (typeof content === "string") return { imageCount: 0, documentCount: 0 };
  return {
    imageCount: content.filter((part) => part.type === "image").length,
    documentCount: content.filter((part) => part.type === "document").length,
  };
}

/** Approximate decoded byte size of the pending attachments, for the 10MB/message guardrail. */
export function totalAttachmentBytes(files: FilePart[]): number {
  return files.reduce((sum, file) => {
    if (file.textContent !== undefined) {
      return sum + new TextEncoder().encode(file.textContent).length;
    }
    const { data } = stripDataUrlPrefix(file.url);
    return sum + base64ByteLength(data);
  }, 0);
}

function base64ByteLength(base64: string): number {
  if (base64.length === 0) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
