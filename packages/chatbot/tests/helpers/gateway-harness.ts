import { afterEach } from "vitest";
import { setupServer } from "msw/node";
import { createGatewayScenario } from "@ai-chatbot/model-gateway-testing";
import type {
  GatewayScenario,
  GatewayScenarioConfig,
} from "@ai-chatbot/model-gateway-testing";
import { warmModelCatalog } from "@/lib/infrastructure/ai/catalog";
import {
  TEST_INTERNAL_MODELS,
  TEST_MODELS,
} from "@/tests/mocks/gateway/catalog";

/**
 * Social unit test harness at the Model Gateway HTTP seam (ADR 0013).
 *
 * A test installs ONE scenario per test with `use()`, exercises the feature
 * through its public interface, and audits what left the process through that
 * scenario's `requests`. Inference is never faked inside the process: MSW
 * intercepts the real SDK/`inferenceKit` HTTP calls, so serialization and
 * response interpretation stay under test, and no gateway has to be listening.
 *
 * The catalog is consumer-owned (the toolkit passes entries through): by default
 * the harness serves the same catalog the E2E harness registers, which already
 * declares the `*-default` contracts `languageModel()` resolves synchronously.
 * A test that needs different metadata overrides `catalog` explicitly.
 *
 * The consumer owns the MSW lifecycle: this helper only registers Vitest hooks
 * for its own server (`onUnhandledRequest: "error"`, so an unstubbed gateway call
 * fails loudly instead of reaching a real server) and drops the previous test's
 * handlers after each test.
 */

/** Default catalog for feature tests: the ids the E2E harness registers. */
export const TEST_GATEWAY_CATALOG: GatewayScenarioConfig["catalog"] = {
  public: TEST_MODELS,
  internal: TEST_INTERNAL_MODELS,
};

export interface GatewayHarness {
  /**
   * Installs a fresh scenario (own responders and recorded requests) for the
   * current test and warms the catalog snapshot the kit resolves contracts from
   * — the same warm-up point production uses. Returns the scenario so the test
   * can audit `scenario.requests` and call `scenario.reset()`.
   */
  use(config?: GatewayScenarioConfig): Promise<GatewayScenario>;
}

export function setupGatewayHarness(): GatewayHarness {
  const server = setupServer();

  server.listen({ onUnhandledRequest: "error" });
  afterEach(() => {
    server.resetHandlers();
  });

  return {
    async use(config: GatewayScenarioConfig = {}) {
      const scenario = createGatewayScenario({
        ...config,
        catalog: config.catalog ?? TEST_GATEWAY_CATALOG,
      });
      server.use(...scenario.handlers);
      // Cold-cache warm-up: the catalog fetch is served by this scenario's
      // handlers. The cache lives 60 s per process, so only the first call of a
      // file actually hits the transport.
      await warmModelCatalog();
      return scenario;
    },
  };
}
