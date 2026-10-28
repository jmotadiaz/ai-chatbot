import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterEach, beforeEach } from "vitest";
import {
  createGatewayScenario,
  type GatewayScenario,
  type GatewayScenarioConfig,
} from "@ai-chatbot/model-gateway-testing";

/**
 * Gateway seam of the Coding Agent Worker tests (ADR 0013, ticket 10).
 *
 * The Worker talks to the Model Gateway over HTTP only: `fetchGatewayCatalog`
 * issues `GET /v1/models/catalog` and everything else (chat, embeddings, …) goes
 * through the Pi runtime. Tests substitute that HTTP seam with the official
 * toolkit instead of re-stubbing `globalThis.fetch`: the worker's real `fetch`
 * call still runs, MSW answers it in-process, and every request the worker sends
 * is recorded by the scenario instance that answered it.
 *
 * Catalog semantics are consumer-owned: the Worker tests pass their own
 * `GatewayModelEntry` lists (ids such as `Alpha 1`, `Muse Spark 1.3`) through
 * `catalog.public`, exactly what the Gateway would publish.
 *
 * Reconfigurable phases: `use()` returns a FRESH scenario bound to the handlers
 * currently installed and clears the previous ones, so a test that needs the
 * Gateway to publish a model, drop it, or die simply opens a new phase and
 * audits that phase's `requests`. No global queue, counter or shared mutable
 * catalog; each phase's recorded requests belong to that phase alone.
 *
 * Scope limits (deliberate):
 * - MSW answers EVERY origin, so this harness cannot prove which origin the
 *   worker targeted. Tests whose subject IS the transport (catalog URL, auth
 *   header, ECONNREFUSED) use the toolkit's real HTTP server instead
 *   (`@ai-chatbot/model-gateway-testing/server`), where only the injected URL
 *   can answer.
 * - The consumer owns the MSW lifecycle; this helper only wraps listen/close
 *   and keeps `onUnhandledRequest: "error"` so an unstubbed gateway call fails
 *   loudly instead of reaching a real server.
 */

export interface WorkerGatewayHarness {
  /**
   * Installs a new phase: creates a scenario for `config`, replaces the
   * handlers of every previous phase, and returns the scenario (its `requests`
   * are the calls this phase answered).
   */
  use(config?: GatewayScenarioConfig): GatewayScenario;
  /**
   * Installs a phase in which the Gateway is unreachable: the request fails at
   * the transport level (no HTTP response), which is exactly what the worker
   * observes from `ECONNREFUSED` — `fetch` rejects, so the catalog error path
   * and the "keep the last good catalog" refresh policy run for real.
   */
  failTransport(): void;
}

export function setupWorkerGatewayHarness(): WorkerGatewayHarness {
  const server = setupServer();

  beforeEach(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    server.close();
  });

  return {
    use(config: GatewayScenarioConfig = {}) {
      const scenario = createGatewayScenario(config);
      server.resetHandlers(...scenario.handlers);
      return scenario;
    },
    failTransport() {
      server.resetHandlers(http.all("*/v1/*", () => HttpResponse.error()));
    },
  };
}
