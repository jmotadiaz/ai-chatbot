import { MockLanguageModelV3 } from "ai/test";
import { textStream } from "../streams";
import type { MockModelEntry } from "../../types";

const model = new MockLanguageModelV3({
  modelId: "Claude Sonnet 4.6",
  doStream: async () => textStream("Hello from Claude Sonnet 4.6 (mock)"),
  doGenerate: async () => ({
    content: [{ type: "text", text: "Hello from Claude Sonnet 4.6 (mock)" }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
    warnings: [],
  }),
});

export const MOCK_CLAUDE_SONNET: MockModelEntry = {
  id: "Claude Sonnet 4.6",
  displayName: "Claude Sonnet 4.6",
  capabilities: {},
  languageModel: model,
};
