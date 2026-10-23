import "server-only";

import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3File,
  LanguageModelV3GenerateResult,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { gatewayBaseUrl, gatewayHeaders } from "./gateway";

/**
 * Purpose-built transport for the `image-default` image contract (spec §2.4).
 *
 * The generic `@ai-sdk/openai-compatible` transport does NOT parse the response's
 * image parts (`files` comes back empty even when the upstream generates the
 * image) and does not accept the body's top-level `modalities` field, so
 * `imageEdit` ended up degraded to text-only. This minimal `LanguageModelV3`
 * talks directly to `POST /v1/chat/completions`:
 *
 * - Request: `{ model: "image-default", messages, modalities: ["image","text"] }`
 *   — the contract's modalities are pinned in the Gateway's `config.yaml`;
 *   the caller does not pass `providerOptions`.
 * - OpenAI response: `choices[0].message.content` with parts
 *   `{type:"text"}` and `{type:"image_url", image_url:{url:"data:image/png;base64,…"}}`
 *   → mapped to `LanguageModelV3Content` (`text` / `file`), which is what the
 *   AI SDK turns into `GeneratedFile`.
 *
 * It only covers the image contract: every other model still goes through the
 * generic transport (`inference-kit.ts`). Images do not need real
 * streaming: `doStream` re-emits the `doGenerate` result as parts.
 */

export const IMAGE_CONTRACT = "image-default";

/** Media type of the PNG the upstream serves (and the Mock Model Gateway). */
export const IMAGE_MEDIA_TYPE = "image/png";

interface GatewayImagePart {
  type?: string;
  text?: string;
  image_url?: { url?: string };
}

interface GatewayImageResponse {
  choices?: Array<{
    message?: { content?: string | GatewayImagePart[] };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface OpenAiMessage {
  role: string;
  content: string | Array<OpenAiPart>;
}

type OpenAiPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** V3 prompt part, duck-typed (the union changes per role). */
interface PromptPart {
  type?: string;
  text?: string;
  data?: unknown;
  mediaType?: string;
}

/** `LanguageModelV3FilePart.data` (bytes / base64 / URL) → URL `data:`. */
function toImageUrl(part: PromptPart): string | null {
  if (part.type !== "file") return null;
  if (part.data instanceof URL) return part.data.href;
  if (typeof part.data === "string") {
    return part.data.startsWith("data:") || part.data.startsWith("http")
      ? part.data
      : `data:${part.mediaType};base64,${part.data}`;
  }
  const base64 = Buffer.from(part.data as Uint8Array).toString("base64");
  return `data:${part.mediaType};base64,${base64}`;
}

/** Standard V3 prompt → OpenAI messages (text + image_url). */
function toOpenAiMessages(prompt: LanguageModelV3Prompt): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [];
  for (const message of prompt) {
    if (message.role === "tool") continue; // the image contract uses no tools
    if (typeof message.content === "string") {
      // role "system": the content is already plain text.
      if (message.content) messages.push({ role: message.role, content: message.content });
      continue;
    }
    const parts: OpenAiPart[] = [];
    for (const part of message.content as readonly PromptPart[]) {
      if (part.type === "text") {
        parts.push({ type: "text", text: part.text ?? "" });
      } else if (part.type === "file") {
        const url = toImageUrl(part);
        if (url) parts.push({ type: "image_url", image_url: { url } });
      } else if (part.type === "reasoning" && part.text) {
        parts.push({ type: "text", text: part.text });
      }
    }
    if (parts.length > 0) {
      messages.push({ role: message.role, content: parts });
    }
  }
  return messages;
}

/** `data:<mediaType>;base64,<data>` → `file` part of the V3 protocol. */
function parseDataUrl(url: string): LanguageModelV3File | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!match) return null;
  return { type: "file", mediaType: match[1]!, data: match[2]! };
}

function mapUsage(raw: GatewayImageResponse["usage"]): LanguageModelV3Usage {
  const input = raw?.prompt_tokens;
  const output = raw?.completion_tokens;
  return {
    inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: output, text: output, reasoning: undefined },
    raw: raw as LanguageModelV3Usage["raw"],
  };
}

function mapFinishReason(raw: string | undefined): { unified: "stop" | "length" | "other"; raw: string | undefined } {
  if (raw === "stop") return { unified: "stop", raw };
  if (raw === "length") return { unified: "length", raw };
  return { unified: "other", raw };
}

/** OpenAI response → `LanguageModelV3GenerateResult`. */
function mapResponse(response: GatewayImageResponse): LanguageModelV3GenerateResult {
  const choice = response.choices?.[0];
  const content = choice?.message?.content;
  const parts: LanguageModelV3Content[] = [];
  const warnings: LanguageModelV3GenerateResult["warnings"] = [];

  const textOrParts =
    typeof content === "string" ? [{ type: "text", text: content }] : (content ?? []);
  for (const part of textOrParts) {
    if (part.type === "text" && part.text) {
      parts.push({ type: "text", text: part.text });
    } else if (part.type === "image_url" && part.image_url?.url) {
      const file = parseDataUrl(part.image_url.url);
      if (file) parts.push(file);
      else warnings.push({ type: "other", message: "image_url is not a data: URL; skipped" });
    }
  }

  return {
    content: parts,
    finishReason: mapFinishReason(choice?.finish_reason),
    usage: mapUsage(response.usage),
    warnings,
  };
}

/**
 * Creates the V3 transport for the `image-default` contract. Memoized by the
 * composition root (`inference-kit.languageModel`); it reads no global state
 * apart from the Gateway config (`gatewayBaseUrl`/`gatewayHeaders`).
 */
export function createGatewayImageModel(): LanguageModelV3 {
  const doGenerate = async (
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> => {
    const response = await fetch(`${gatewayBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { ...gatewayHeaders(), "Content-Type": "application/json" },
      signal: options.abortSignal,
      body: JSON.stringify({
        model: IMAGE_CONTRACT,
        messages: toOpenAiMessages(options.prompt),
        modalities: ["image", "text"],
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.maxOutputTokens !== undefined && { max_tokens: options.maxOutputTokens }),
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Image generation request failed: ${response.status} ${response.statusText}`,
      );
    }
    return mapResponse((await response.json()) as GatewayImageResponse);
  };

  return {
    specificationVersion: "v3",
    provider: "model-gateway",
    modelId: IMAGE_CONTRACT,
    supportedUrls: {},
    doGenerate,
    doStream: async (options): Promise<LanguageModelV3StreamResult> => {
      const result = await doGenerate(options);
      const warnings = result.warnings;
      const stream = new ReadableStream<LanguageModelV3StreamPart>({
        async start(controller) {
          controller.enqueue({ type: "stream-start", warnings });
          let textIndex = 0;
          for (const part of result.content) {
            if (part.type === "text") {
              const id = `text-${textIndex++}`;
              controller.enqueue({ type: "text-start", id });
              controller.enqueue({ type: "text-delta", id, delta: part.text });
              controller.enqueue({ type: "text-end", id });
            } else {
              // Only text and file come out of the image contract.
              controller.enqueue(part as LanguageModelV3File);
            }
          }
          controller.enqueue({
            type: "finish",
            finishReason: result.finishReason,
            usage: result.usage,
          });
          controller.close();
        },
      });
      return { stream };
    },
  };
}
