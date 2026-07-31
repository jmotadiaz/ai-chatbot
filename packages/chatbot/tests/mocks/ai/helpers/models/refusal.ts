import { MockLanguageModelV3 } from "ai/test";
import { textStream } from "../streams";
import type { MockModelEntry } from "../../types";

const model = new MockLanguageModelV3({
  modelId: "alwaysRefuses",
  doStream: textStream("I cannot help with that request."),
  doGenerate: async () => ({
    content: [{ type: "text", text: "I cannot help with that request." }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
    warnings: [],
  }),
});

export const MOCK_REFUSAL: MockModelEntry = {
  capabilities: { errorScenarios: ["refusal"] },
  languageModel: model,
};
