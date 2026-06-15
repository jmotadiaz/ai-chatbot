import { MockLanguageModelV3 } from "ai/test";
import { fileStream } from "../streams";
import type { MockModelEntry } from "../../types";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const model = new MockLanguageModelV3({
  modelId: "Gemini 3 Flash",
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

export const MOCK_GEMINI_3_FLASH_VISION: MockModelEntry = {
  id: "Gemini 3 Flash",
  displayName: "Gemini 3 Flash",
  capabilities: { multimodal: true },
  languageModel: model,
};
