import { describe, expect, it } from "vitest";
import { createInferenceKit } from "inference";
import {
  createMockEmbeddingModel,
  createMockModel,
  errorChunk,
  errorStream,
  fileChunks,
  fileStream,
  finishChunk,
  MOCK_MID_STREAM_ERROR,
  MOCK_REASONING,
  MOCK_REFUSAL,
  MOCK_TOOL_EXECUTION,
  MOCK_VISION,
  reasoningChunks,
  reasoningStream,
  textChunks,
  textStream,
  toolCallChunks,
  toolCallStream,
} from "inference/testing";

/**
 * The coding-agent worker does not consume the Inference Kit yet (out of
 * scope for this spec); this test only guarantees what user story 6 asks
 * for: the package (and its index) resolve and run from a plain Node/tsx
 * process with no Next.js in the picture, the same way `models` already does
 * for this package (see tests/integration/session-manager-available-models).
 *
 * `createInferenceKit()` builds nothing eagerly (clients are lazy, memoized
 * getters), so calling it here performs no real client construction and
 * needs no provider API keys.
 */
describe("inference package import (contract)", () => {
  it("resolves and builds a kit from a plain tsx process", () => {
    const kit = createInferenceKit();

    expect(typeof kit.languageModel).toBe("function");
    expect(typeof kit.embed).toBe("function");
    expect(typeof kit.rerank).toBe("function");
    expect(typeof kit.speechModel).toBe("function");
    expect(typeof kit.createAgent).toBe("function");

    const expectedKinds = [
      "opencodeGo",
      "opencodeGoResponses",
      "opencodeGoAnthropic",
      "opencodeZen",
      "gateway",
      "openrouter",
      "openai",
      "xai",
      "groq",
      "perplexity",
      "lmstudio",
      "deepinfra",
    ] as const;

    for (const kind of expectedKinds) {
      expect(typeof kit.clients[kind], kind).toBe("function");
    }
  });
});

/**
 * User story 13 ("a coding-agent test author, I want to reuse the same mock
 * builders as the chatbot"): `inference/testing` must resolve and actually
 * run from the same plain tsx process, with no model id of its own — the
 * chatbot's tests bind these builders to real catalog ids, this package
 * never does.
 */
describe("inference/testing import (contract)", () => {
  it("resolves the mock builders from a plain tsx process", () => {
    expect(typeof createMockModel).toBe("function");
    expect(typeof createMockEmbeddingModel).toBe("function");

    const model = createMockModel("plain-tsx-mock");
    expect(model.specificationVersion).toBe("v3");

    const embeddingModel = createMockEmbeddingModel();
    expect(embeddingModel.specificationVersion).toBe("v3");
  });

  it("builds chunk and stream sequences with no model id involved", () => {
    for (const builder of [textChunks, reasoningChunks, toolCallChunks, fileChunks]) {
      expect(typeof builder).toBe("function");
    }
    expect(typeof errorChunk).toBe("function");
    expect(typeof finishChunk).toBe("function");
    expect(finishChunk()).toMatchObject({ type: "finish" });

    for (const builder of [textStream, reasoningStream, toolCallStream, fileStream, errorStream]) {
      expect(typeof builder).toBe("function");
    }
    expect(textStream("hi").stream).toBeDefined();
  });

  it("exposes the five ready-made behaviours, each a runnable LanguageModelV3 with no bound model id", () => {
    const behaviours = {
      MOCK_TOOL_EXECUTION,
      MOCK_VISION,
      MOCK_REASONING,
      MOCK_REFUSAL,
      MOCK_MID_STREAM_ERROR,
    };

    for (const [name, behaviour] of Object.entries(behaviours)) {
      expect(behaviour.languageModel.specificationVersion, name).toBe("v3");
      expect(typeof behaviour.capabilities, name).toBe("object");
    }
  });
});
