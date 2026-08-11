import { performance } from "node:perf_hooks";
import { config } from "config";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Middleware,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import {
  bumpStepIndex,
  getTraceContext,
} from "./context";
import type {
  FinishPayload,
  PromptPayload,
  ToolCallPayload,
  TraceEvent,
  TraceSink,
} from "./types";

const handlePromptContent = (
  content: LanguageModelV3CallOptions["prompt"][number]["content"],
): unknown => {
  if (typeof content === "string") {
    return { type: "text", text: content };
  }
  if (!Array.isArray(content)) {
    return { type: "text", text: String(content) };
  }
  return content.map((part) => {
    if (part.type === "text") {
      return { type: "text", text: part.text };
    }
    if (part.type === "reasoning") {
      return { type: "reasoning", text: part.text };
    }
    if (part.type === "tool-call") {
      return {
        type: "tool-call",
        toolName: part.toolName,
        input: part.input,
        toolCallId: part.toolCallId,
      };
    }
    if (part.type === "tool-result") {
      return {
        type: "tool-result",
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        output: serializeToolResultOutput(part.output),
      };
    }
    if (part.type === "file") {
      return {
        type: "file",
        mediaType: part.mediaType,
        filename: part.filename,
        data: "<omitted>",
      };
    }
    return { type: part.type };
  });
};

const serializeToolResultOutput = (output: unknown): unknown => {
  if (!output || typeof output !== "object") return output;
  const o = output as { type?: string; value?: unknown };
  if (o.type === "content") {
    return { type: "content", value: "<omitted-multimodal>" };
  }
  if (typeof o.value === "string" && o.value.length > 2000) {
    return { type: o.type, value: o.value.slice(0, 2000) + "..." };
  }
  return output;
};

const buildPromptPayload = (
  prompt: LanguageModelV3CallOptions["prompt"],
  model: LanguageModelV3,
  settings?: Record<string, unknown>,
): PromptPayload => ({
  prompt: prompt.map((m) => ({
    role: m.role,
    content: handlePromptContent(m.content),
  })),
  model: { provider: model.provider, modelId: model.modelId },
  settings,
});

const baseEvent = (
  sink: TraceSink,
  phase: TraceEvent["phase"],
  payload: unknown,
  extra: Partial<TraceEvent> = {},
): void => {
  const ctx = getTraceContext();
  const event: TraceEvent = {
    ts: new Date().toISOString(),
    runId: ctx?.runId ?? config.traceRunId() ?? "unknown",
    requestId: ctx?.requestId ?? "no-request",
    stepIndex: ctx?.stepIndex ?? 0,
    mode: "stream",
    chatId: ctx?.chatId,
    userId: ctx?.userId,
    agent: ctx?.agent,
    modelKey: ctx?.modelKey,
    phase,
    payload,
    ...extra,
  };
  sink.write(event);
};

export const createTracingMiddleware = (sink: TraceSink): LanguageModelV3Middleware => {
  return {
    specificationVersion: "v3",

    wrapGenerate: async ({ doGenerate, params, model }) => {
      const start = performance.now();
      const stepIndex = bumpStepIndex();
      baseEvent(sink, "start", buildPromptPayload(params.prompt, model, {
        maxOutputTokens: params.maxOutputTokens,
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
      }), { mode: "generate", stepIndex, modelKey: getTraceContext()?.modelKey });

      try {
        const result = await doGenerate();
        const end = performance.now();

        const text = result.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { type: "text"; text: string }).text)
          .join("");

        const reasoning = result.content
          .filter((c) => c.type === "reasoning")
          .map((c) => (c as { type: "reasoning"; text: string }).text)
          .join("");

        const toolCalls: ToolCallPayload[] = result.content
          .filter((c) => c.type === "tool-call")
          .map((c) => {
            const tc = c as {
              type: "tool-call";
              toolCallId: string;
              toolName: string;
              input: unknown;
              providerExecuted?: boolean;
            };
            return {
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: tc.input,
              providerExecuted: tc.providerExecuted,
            };
          });

        const toolResults: ToolCallPayload[] = result.content
          .filter((c) => c.type === "tool-result")
          .map((c) => {
            const tr = c as unknown as {
              type: "tool-result";
              toolCallId: string;
              toolName: string;
              output?: unknown;
              result?: unknown;
            };
            return {
              toolCallId: tr.toolCallId,
              toolName: tr.toolName,
              output: serializeToolResultOutput(tr.output ?? tr.result),
            };
          });

        const sources = result.content
          .filter((c) => c.type === "source")
          .map((c) => {
            const s = c as unknown as {
              type: "source";
              sourceType: "url" | "document";
              id?: string;
              url?: string;
              title?: string;
              mediaType?: string;
              filename?: string;
            };
            if (s.sourceType === "url") {
              return { url: s.url ?? "", title: s.title, sourceType: "url" as const };
            }
            return {
              url: `document:${s.id ?? ""}`,
              title: s.title ?? s.filename,
              sourceType: "document" as const,
            };
          });

        const finishPayload: FinishPayload = {
          finishReason: result.finishReason as { unified: string; raw?: unknown },
          usage: normalizeUsage(result.usage),
          providerMetadata: result.providerMetadata,
        };

        if (text) {
          baseEvent(sink, "text-delta", { text, blockId: "generate-text" }, { mode: "generate", stepIndex, blockId: "generate-text", blockKind: "text" });
        }
        if (reasoning) {
          baseEvent(sink, "reasoning-delta", { text: reasoning, blockId: "generate-reasoning" }, { mode: "generate", stepIndex, blockId: "generate-reasoning", blockKind: "reasoning" });
        }
        for (const tc of toolCalls) {
          baseEvent(sink, "tool-call", tc, { mode: "generate", stepIndex });
        }
        for (const tr of toolResults) {
          baseEvent(sink, "tool-result", tr, { mode: "generate", stepIndex });
        }
        for (const src of sources) {
          baseEvent(sink, "source", src, { mode: "generate", stepIndex });
        }
        baseEvent(sink, "finish", { ...finishPayload, duration_ms: end - start }, { mode: "generate", stepIndex });

        return result;
      } catch (err) {
        const end = performance.now();
        baseEvent(sink, "error", { error: serializeError(err), duration_ms: end - start }, { mode: "generate", stepIndex });
        throw err;
      }
    },

    wrapStream: async ({ doStream, params, model }) => {
      const start = performance.now();
      const stepIndex = bumpStepIndex();
      baseEvent(sink, "start", buildPromptPayload(params.prompt, model, {
        maxOutputTokens: params.maxOutputTokens,
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
      }), { mode: "stream", stepIndex, modelKey: getTraceContext()?.modelKey });

      const { stream, ...rest } = await doStream();
      let finishEmitted = false;
      let aborted = false;
      const pendingToolInputs = new Map<string, { toolName: string; input: string }>();

      const transform = new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
        transform(chunk, controller) {
          switch (chunk.type) {
            case "text-start": {
              baseEvent(sink, "text-delta", { text: "", blockId: chunk.id }, { mode: "stream", stepIndex, blockId: chunk.id, blockKind: "text" });
              break;
            }
            case "text-delta": {
              baseEvent(sink, "text-delta", { text: chunk.delta, blockId: chunk.id }, { mode: "stream", stepIndex, blockId: chunk.id, blockKind: "text" });
              break;
            }
            case "text-end": {
              break;
            }
            case "reasoning-start": {
              baseEvent(sink, "reasoning-delta", { text: "", blockId: chunk.id }, { mode: "stream", stepIndex, blockId: chunk.id, blockKind: "reasoning" });
              break;
            }
            case "reasoning-delta": {
              baseEvent(sink, "reasoning-delta", { text: chunk.delta, blockId: chunk.id }, { mode: "stream", stepIndex, blockId: chunk.id, blockKind: "reasoning" });
              break;
            }
            case "reasoning-end": {
              break;
            }
            case "tool-input-start": {
              pendingToolInputs.set(chunk.id, { toolName: chunk.toolName, input: "" });
              baseEvent(sink, "tool-input-start", { toolCallId: chunk.id, toolName: chunk.toolName, providerExecuted: chunk.providerExecuted }, { mode: "stream", stepIndex });
              break;
            }
            case "tool-input-delta": {
              const pending = pendingToolInputs.get(chunk.id);
              if (pending) pending.input += chunk.delta;
              baseEvent(sink, "tool-input-delta", { toolCallId: chunk.id, delta: chunk.delta }, { mode: "stream", stepIndex });
              break;
            }
            case "tool-input-end": {
              const pending = pendingToolInputs.get(chunk.id);
              let parsed: unknown = undefined;
              if (pending) {
                try {
                  parsed = JSON.parse(pending.input);
                } catch {
                  parsed = pending.input;
                }
                baseEvent(sink, "tool-call", { toolCallId: chunk.id, toolName: pending.toolName, input: parsed }, { mode: "stream", stepIndex });
                pendingToolInputs.delete(chunk.id);
              }
              break;
            }
            case "tool-call": {
              baseEvent(sink, "tool-call", {
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                input: chunk.input,
                providerExecuted: chunk.providerExecuted,
              }, { mode: "stream", stepIndex });
              break;
            }
            case "tool-result": {
              const tr = chunk as unknown as {
                toolCallId: string;
                toolName: string;
                output?: unknown;
                result?: unknown;
              };
              baseEvent(sink, "tool-result", {
                toolCallId: tr.toolCallId,
                toolName: tr.toolName,
                output: serializeToolResultOutput(tr.output ?? tr.result),
              }, { mode: "stream", stepIndex });
              break;
            }
            case "source": {
              const s = chunk as unknown as {
                sourceType: "url" | "document";
                id?: string;
                url?: string;
                title?: string;
                mediaType?: string;
                filename?: string;
              };
              const payload = s.sourceType === "url"
                ? { url: s.url ?? "", title: s.title, sourceType: "url" as const }
                : { url: `document:${s.id ?? ""}`, title: s.title ?? s.filename, sourceType: "document" as const };
              baseEvent(sink, "source", payload, { mode: "stream", stepIndex });
              break;
            }
            case "finish": {
              finishEmitted = true;
              const finishPayload: FinishPayload = {
                finishReason: chunk.finishReason as { unified: string; raw?: unknown },
                usage: normalizeUsage(chunk.usage),
                providerMetadata: chunk.providerMetadata,
              };
              baseEvent(sink, "finish", { ...finishPayload, duration_ms: performance.now() - start }, { mode: "stream", stepIndex });
              break;
            }
            case "error": {
              baseEvent(sink, "error", { error: serializeError(chunk.error), duration_ms: performance.now() - start }, { mode: "stream", stepIndex });
              break;
            }
            case "stream-start":
            case "response-metadata":
            case "raw":
              break;
          }
          controller.enqueue(chunk);
        },
        flush() {
          if (!finishEmitted) {
            baseEvent(sink, "abort", { reason: "stream finished without a finish or error chunk", duration_ms: performance.now() - start }, { mode: "stream", stepIndex });
            aborted = true;
          }
        },
      });

      const wrapped = new ReadableStream<LanguageModelV3StreamPart>({
        async start(controller) {
          const reader = stream.pipeThrough(transform).getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
            controller.close();
          } catch (err) {
            if (!aborted && !finishEmitted) {
              baseEvent(sink, "abort", { reason: serializeError(err), duration_ms: performance.now() - start }, { mode: "stream", stepIndex });
            }
            controller.error(err);
          }
        },
        cancel(reason) {
          if (!aborted && !finishEmitted) {
            baseEvent(sink, "abort", { reason: serializeError(reason), duration_ms: performance.now() - start }, { mode: "stream", stepIndex });
            aborted = true;
          }
        },
      });

      return {
        stream: wrapped,
        ...rest,
      };
    },
  };
};

const normalizeUsage = (usage: unknown): FinishPayload["usage"] => {
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as Record<string, unknown>;
  const readTotal = (key: string): number | undefined => {
    const v = u[key];
    if (typeof v === "number") return v;
    if (v && typeof v === "object") {
      const total = (v as Record<string, unknown>).total;
      if (typeof total === "number") return total;
    }
    return undefined;
  };
  return {
    inputTokens: readTotal("inputTokens"),
    outputTokens: readTotal("outputTokens"),
    totalTokens: readTotal("totalTokens"),
    reasoningTokens: (u.outputTokens && typeof u.outputTokens === "object"
      ? (u.outputTokens as Record<string, unknown>).reasoning
      : undefined) as number | undefined,
    cachedInputTokens: (u.inputTokens && typeof u.inputTokens === "object"
      ? (u.inputTokens as Record<string, unknown>).cacheRead
      : undefined) as number | undefined,
  };
};

const serializeError = (err: unknown): unknown => {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
};
