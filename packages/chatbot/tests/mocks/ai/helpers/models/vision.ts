import { MockLanguageModelV3 } from "ai/test";
import { fileStream } from "../streams";
import type { MockModelEntry } from "../../types";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const model = new MockLanguageModelV3({
  modelId: "canSeeImages",
  doStream: fileStream("image/png", TINY_PNG_BASE64, "Image description (mock)"),
  doGenerate: async () => ({
    content: [
      {
        type: "file",
        mediaType: "image/png",
        data: TINY_PNG_BASE64,
      },
      { type: "text", text: "Image description (mock)" },
    ],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
    warnings: [],
  }),
});

export const MOCK_VISION: MockModelEntry = {
  capabilities: { multimodal: true },
  languageModel: model,
};
