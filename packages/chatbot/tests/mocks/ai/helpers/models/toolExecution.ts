import { MockLanguageModelV3 } from "ai/test";
import { toolCallStream, textStream } from "../streams";
import type { MockModelEntry } from "../../types";

const model = new MockLanguageModelV3({
  modelId: "canExecuteTools",
  doStream: [
    toolCallStream("webSearch", { query: "current weather in San Francisco" }),
    textStream(
      "Based on the search results, it is 68°F and sunny in San Francisco.",
    ),
  ],
  doGenerate: async () => ({
    content: [{ type: "text", text: "Hello from the tool-calling mock" }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
    warnings: [],
  }),
});

export const MOCK_TOOL_EXECUTION: MockModelEntry = {
  capabilities: { toolExecution: true },
  languageModel: model,
};
