import { MockLanguageModelV3 } from "ai/test";
import {
  chatModelKeys,
  type chatModelId,
} from "@/lib/features/foundation-model/config";
import type { MockModelEntry } from "./types";
import { MOCK_CLAUDE_SONNET } from "./helpers/models/claudeSonnet";
import { textStream } from "./helpers/streams";

const createGenericMock = (modelId: chatModelId): MockModelEntry => {
  const model = new MockLanguageModelV3({
    modelId,
    doStream: async () => textStream(`Hello from ${modelId} (mock)`),
    doGenerate: async () => ({
      content: [{ type: "text", text: `Hello from ${modelId} (mock)` }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
      warnings: [],
    }),
  });
  return {
    id: modelId,
    displayName: modelId,
    capabilities: {},
    languageModel: model,
  };
};

const GENERIC_MODELS: Record<chatModelId, MockModelEntry> = Object.fromEntries(
  chatModelKeys.map((id) => [id, createGenericMock(id)]),
) as Record<chatModelId, MockModelEntry>;

export const MOCK_MODELS: Record<chatModelId, MockModelEntry> = {
  ...GENERIC_MODELS,
  "Claude Sonnet 4.6": MOCK_CLAUDE_SONNET,
};
