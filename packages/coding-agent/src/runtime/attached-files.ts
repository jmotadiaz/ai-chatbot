/**
 * Text-file attachments have no native representation in Pi's `prompt()` —
 * only images do (via `PromptOptions.images`). To let a user attach a
 * `.md`/`.txt`/`.xml`/`.json` file to a coding-agent turn, its content is
 * inlined into the prompt text as a fenced block before the call, and
 * extracted back out when Pi's stored history is converted back to AG-UI
 * messages, so the raw blob never resurfaces in the UI on reload.
 */

const ATTACHED_FILE_CLOSE = "<<<END_ATTACHED_FILE>>>";

const ATTACHED_FILE_PATTERN =
  /^<<<ATTACHED_FILE filename="((?:[^"\\]|\\.)*)" mimeType="((?:[^"\\]|\\.)*)">>>\n([\s\S]*?)\n<<<END_ATTACHED_FILE>>>$/gm;

export interface AttachedDoc {
  filename: string;
  mimeType: string;
  content: string;
}

export interface ExtractedImage {
  data: string;
  mimeType: string;
}

export interface ExtractedUserContent {
  text: string;
  images: ExtractedImage[];
  docs: AttachedDoc[];
}

function escapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unescapeAttr(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

/** Appends `docs` to `text` as fenced blocks. Inverse of `splitAttachedFiles`. */
export function inlineAttachedFiles(text: string, docs: AttachedDoc[]): string {
  if (docs.length === 0) return text;
  const blocks = docs.map(
    (doc) =>
      `<<<ATTACHED_FILE filename="${escapeAttr(doc.filename)}" mimeType="${escapeAttr(doc.mimeType)}">>>\n${doc.content}\n${ATTACHED_FILE_CLOSE}`,
  );
  return [text, ...blocks].filter((part) => part.length > 0).join("\n\n");
}

/**
 * Strips fenced attached-file blocks back out of `text`. Tolerant of
 * malformed/partial fences (e.g. a missing closing marker): unmatched text
 * is left exactly as-is, never throws.
 */
export function splitAttachedFiles(text: string): { text: string; docs: AttachedDoc[] } {
  const docs: AttachedDoc[] = [];
  const stripped = text.replace(ATTACHED_FILE_PATTERN, (_match, filename, mimeType, content) => {
    docs.push({
      filename: unescapeAttr(filename as string),
      mimeType: unescapeAttr(mimeType as string),
      content: content as string,
    });
    return "";
  });
  if (docs.length === 0) {
    return { text, docs };
  }
  return {
    text: stripped.replace(/\n{3,}/g, "\n\n").replace(/\n+$/, ""),
    docs,
  };
}

function stripDataUrlPrefix(value: string): string {
  const match = /^data:[^;]*;base64,([\s\S]*)$/.exec(value);
  return match ? match[1]! : value;
}

interface AguiInputContentSource {
  type?: string;
  value?: string;
  mimeType?: string;
}

interface AguiInputContentPart {
  type?: string;
  text?: string;
  source?: AguiInputContentSource;
  metadata?: Record<string, unknown>;
}

/**
 * Parses a client AG-UI user message's `content` — either a plain string or
 * an `InputContent[]` (text/image/document parts, per `@ag-ui/core`'s
 * `UserMessage.content` union) — into the raw typed text plus any attached
 * images and text documents. Only `source: {type: "data"}` parts are
 * honored (base64 payloads); this worker never fetches attachment URLs.
 */
export function extractUserContentParts(content: unknown): ExtractedUserContent {
  if (typeof content === "string") {
    return { text: content, images: [], docs: [] };
  }
  if (!Array.isArray(content)) {
    return { text: "", images: [], docs: [] };
  }

  const textParts: string[] = [];
  const images: ExtractedImage[] = [];
  const docs: AttachedDoc[] = [];

  for (const raw of content) {
    const part = raw as AguiInputContentPart;
    if (!part || typeof part !== "object") continue;

    switch (part.type) {
      case "text":
        if (typeof part.text === "string") textParts.push(part.text);
        break;
      case "image": {
        const source = part.source;
        if (source?.type === "data" && typeof source.value === "string") {
          images.push({
            data: stripDataUrlPrefix(source.value),
            mimeType: source.mimeType ?? "image/png",
          });
        }
        break;
      }
      case "document": {
        const source = part.source;
        if (source?.type === "data" && typeof source.value === "string") {
          const filename =
            typeof part.metadata?.filename === "string"
              ? (part.metadata.filename as string)
              : "attachment.txt";
          let text = "";
          try {
            text = Buffer.from(stripDataUrlPrefix(source.value), "base64").toString("utf8");
          } catch {
            text = "";
          }
          docs.push({ filename, mimeType: source.mimeType ?? "text/plain", content: text });
        }
        break;
      }
      default:
        break;
    }
  }

  return { text: textParts.join("\n"), images, docs };
}
