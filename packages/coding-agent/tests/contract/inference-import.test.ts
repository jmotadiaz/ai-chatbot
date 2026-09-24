import { describe, expect, it } from "vitest";
import { createInferenceKit } from "inference";

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
