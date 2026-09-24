import { simulateReadableStream } from "ai";
import type { LanguageModelV3StreamResult } from "@ai-sdk/provider";
import {
  textChunks,
  reasoningChunks,
  toolCallChunks,
  fileChunks,
  errorChunk,
  finishChunk,
} from "./chunks";

export const textStream = (text: string): LanguageModelV3StreamResult => ({
  stream: simulateReadableStream({
    chunks: [...textChunks("text-1", text), finishChunk("stop")],
    chunkDelayInMs: null,
  }),
});

export const reasoningStream = (
  reasoning: string,
  text: string,
): LanguageModelV3StreamResult => ({
  stream: simulateReadableStream({
    chunks: [
      ...reasoningChunks("reasoning-1", reasoning),
      ...textChunks("text-1", text),
      finishChunk("stop"),
    ],
    chunkDelayInMs: null,
  }),
});

export const toolCallStream = (
  toolName: string,
  args: unknown,
): LanguageModelV3StreamResult => ({
  stream: simulateReadableStream({
    chunks: [...toolCallChunks("call-1", toolName, args), finishChunk("tool-calls")],
    chunkDelayInMs: null,
  }),
});

export const fileStream = (
  mediaType: string,
  data: string,
  text: string,
): LanguageModelV3StreamResult => ({
  stream: simulateReadableStream({
    chunks: [...fileChunks(mediaType, data), ...textChunks("text-1", text), finishChunk("stop")],
    chunkDelayInMs: null,
  }),
});

export const errorStream = (error: unknown): LanguageModelV3StreamResult => ({
  stream: simulateReadableStream({
    chunks: [errorChunk(error), finishChunk("error")],
    chunkDelayInMs: null,
  }),
});
