import { MockLanguageModelV3 } from "ai/test";
import { reasoningStream } from "../streams";
import type { MockModelEntry } from "../../types";

const model = new MockLanguageModelV3({
  modelId: "canProduceReasoning",
  doStream: reasoningStream(
    "Let me think about this carefully...",
    "The answer is 42.",
  ),
  doGenerate: async () => ({
    content: [
      {
        type: "reasoning",
        text: "Let me think about this carefully...",
      },
      { type: "text", text: "The answer is 42." },
    ],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
    warnings: [],
  }),
});

export const MOCK_REASONING: MockModelEntry = {
  capabilities: { thinkingBlocks: true },
  languageModel: model,
};
