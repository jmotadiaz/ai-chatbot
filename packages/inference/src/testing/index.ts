/**
 * `inference/testing`: AI SDK mock builders with no model id of their own —
 * generic language/embedding/speech model constructors, the stream/chunk
 * builders they (and any consumer) can compose, and five ready-made
 * behaviours (tool execution, vision, reasoning, refusal, mid-stream error).
 * Binding any of this to a real catalog id is a consumer concern; see the
 * chatbot's capability-alias table
 * (`packages/chatbot/tests/mocks/ai/capabilities.ts`) for how its test
 * composition does that.
 */
export type { MockCapabilities, MockModelEntry } from "./types";
export {
  createMockModel,
  createMockEmbeddingModel,
  createMockSpeechModel,
} from "./mock-model";
export {
  textChunks,
  reasoningChunks,
  toolCallChunks,
  fileChunks,
  errorChunk,
  finishChunk,
} from "./chunks";
export {
  textStream,
  reasoningStream,
  toolCallStream,
  fileStream,
  errorStream,
} from "./streams";
export { MOCK_TOOL_EXECUTION } from "./tool-execution";
export { MOCK_VISION } from "./vision";
export { MOCK_REASONING } from "./reasoning";
export { MOCK_REFUSAL } from "./refusal";
export { MOCK_MID_STREAM_ERROR } from "./mid-stream-error";
