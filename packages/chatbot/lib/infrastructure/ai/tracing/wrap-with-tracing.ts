import "server-only";
import { wrapLanguageModel } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { isTracingEnabled } from "./trace-sink";
import { getSharedTraceSink } from "./shared-sink";
import { createTracingMiddleware } from "./middleware";

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

