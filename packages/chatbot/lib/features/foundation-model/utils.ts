import { extractReasoningMiddleware } from "ai";

export const reasoningMw = extractReasoningMiddleware({
  tagName: "think",
  separator: "\n",
  startWithReasoning: false,
});
