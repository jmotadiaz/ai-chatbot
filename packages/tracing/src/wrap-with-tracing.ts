import { wrapLanguageModel } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createTracingMiddleware } from "./model-middleware";
import { getSharedTraceSink } from "./shared-sink";
import { isTracingEnabled } from "./types";

export const wrapWithTracing = (
  model: LanguageModelV3,
  runId: string,
): LanguageModelV3 => {
  if (!isTracingEnabled()) return model;
  const sink = getSharedTraceSink(runId);
  return wrapLanguageModel({
    model,
    middleware: createTracingMiddleware(sink),
  });
};
