import { MockLanguageModelV3 } from "ai/test";
import { errorStream } from "../streams";
import type { MockModelEntry } from "../../types";

const STREAM_ERROR = new Error("Mock mid-stream error");

const model = new MockLanguageModelV3({
  modelId: "GPT OSS",
  doStream: errorStream(STREAM_ERROR),
  doGenerate: async () => {
    throw STREAM_ERROR;
  },
});

export const MOCK_GPT_OSS_ERROR: MockModelEntry = {
  id: "GPT OSS",
  displayName: "GPT OSS",
  capabilities: { errorScenarios: ["mid_stream_error"] },
  languageModel: model,
};
