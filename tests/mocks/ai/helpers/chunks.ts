import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";

export const textChunks = (id: string, text: string): LanguageModelV3StreamPart[] => [
  { type: "text-start", id },
  { type: "text-delta", id, delta: text },
  { type: "text-end", id },
];

export const reasoningChunks = (id: string, text: string): LanguageModelV3StreamPart[] => [
  { type: "reasoning-start", id },
  { type: "reasoning-delta", id, delta: text },
  { type: "reasoning-end", id },
];

export const toolCallChunks = (
  id: string,
  toolName: string,
  args: unknown,
): LanguageModelV3StreamPart[] => {
  const input = JSON.stringify(args);
  return [
    { type: "tool-input-start", id, toolName },
    { type: "tool-input-delta", id, delta: input },
    { type: "tool-input-end", id },
    {
      type: "tool-call",
      toolCallId: id,
      toolName,
      input,
    },
  ];
};

export const fileChunks = (
  id: string,
  mediaType: string,
  data: string,
): LanguageModelV3StreamPart[] => [
  { type: "file", file: { mediaType, data } },
];

export const errorChunk = (error: unknown): LanguageModelV3StreamPart => ({
  type: "error",
  error,
});

export const finishChunk = (
  reason: "stop" | "tool-calls" | "length" | "error" | "other" = "stop",
): LanguageModelV3StreamPart => ({
  type: "finish",
  finishReason: { unified: reason, raw: reason },
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
});
