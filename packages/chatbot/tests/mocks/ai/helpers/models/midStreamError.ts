import { MockLanguageModelV3 } from "ai/test";
import { errorStream } from "../streams";
import type { MockModelEntry } from "../../types";

const STREAM_ERROR = new Error("Mock mid-stream error");

const model = new MockLanguageModelV3({
  modelId: "failsMidStream",
  doStream: errorStream(STREAM_ERROR),
  doGenerate: async () => {
    throw STREAM_ERROR;
  },
});

export const MOCK_MID_STREAM_ERROR: MockModelEntry = {
  capabilities: { errorScenarios: ["mid_stream_error"] },
  languageModel: model,
};
