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
 * Transport propio para el contrato de imagen `image-default` (spec §2.4).
 *
 * El transport genérico `@ai-sdk/openai-compatible` NO parsea las partes de
 * imagen de la respuesta (`files` vuelve vacío aunque el upstream genere la
 * imagen) y no admite el campo de primer nivel `modalities` del body, así
 * que `imageEdit` quedó degradado a solo-texto. Este `LanguageModelV3` mínimo
 * habla directamente con `POST /v1/chat/completions`:
 *
 * - Petición: `{ model: "image-default", messages, modalities: ["image","text"] }`
 *   — las modalidades del contrato están fijadas en `config.yaml` del
 *   Gateway; el caller no pasa `providerOptions`.
 * - Respuesta OpenAI: `choices[0].message.content` con partes
 *   `{type:"text"}` y `{type:"image_url", image_url:{url:"data:image/png;base64,…"}}`
 *   → se mapea a `LanguageModelV3Content` (`text` / `file`), que es lo que el
 *   AI SDK convierte en `GeneratedFile`.
 *
 * Solo cubre el contrato de imagen: el resto de modelos sigue por el
 * transport genérico (`inference-kit.ts`). La imagen no necesita streaming
 * real: `doStream` re-emetde el resultado de `doGenerate` en partes.
 */

export const IMAGE_CONTRACT = "image-default";

/** Media type del PNG que sirve el upstream (y el Mock Model Gateway). */
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

/** Parte del prompt V3, con tipado pato (la unión cambia por rol). */
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

/** Prompt estándar V3 → mensajes OpenAI (texto + image_url). */
function toOpenAiMessages(prompt: LanguageModelV3Prompt): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [];
  for (const message of prompt) {
    if (message.role === "tool") continue; // el contrato de imagen no usa tools
    if (typeof message.content === "string") {
      // role "system": el contenido ya es texto plano.
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

/** `data:<mediaType>;base64,<data>` → parte `file` del protocolo V3. */
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

/** Respuesta OpenAI → `LanguageModelV3GenerateResult`. */
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
 * Crea el transport V3 del contrato `image-default`. Memoizado por el
 * composition root (`inference-kit.languageModel`); no lee estado global
 * aparte de la config del Gateway (`gatewayBaseUrl`/`gatewayHeaders`).
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
              // Solo text y file salen del contrato de imagen.
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
