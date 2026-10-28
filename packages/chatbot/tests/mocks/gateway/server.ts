/**
 * Canonical Mock Model Gateway of the Test Environment (ADR 0010, ADR 0013) —
 * it stands in for the real Gateway at `MODEL_GATEWAY_URL`
 * (`http://127.0.0.1:4001` in the frozen Test bundle).
 *
 * This module is the chatbot's composition root for the mock: it binds the
 * consumer-owned catalog (`./catalog.ts`) and the named execution profile
 * (`./profiles.ts`) to the official toolkit scenario, and it owns the canonical
 * `:4001` process lifecycle. The protocol (reply rendering, SSE framing, MSW
 * handlers, HTTP server, explicit errors) belongs to
 * `@ai-chatbot/model-gateway-testing`.
 *
 * The catalog and the profile are fixed when the scenario is built and never
 * mutated afterwards: the application caches the catalog per process (60 s TTL
 * in `lib/infrastructure/ai/catalog.ts`), so a per-test change would leak into
 * later journeys.
 */

import {
  HEALTH_PATH,
  createGatewayScenario,
  type GatewayScenario,
} from "@ai-chatbot/model-gateway-testing";
import {
  startGatewayServer,
  type GatewayServer,
} from "@ai-chatbot/model-gateway-testing/server";
import { TEST_INTERNAL_MODELS, TEST_MODELS } from "./catalog";
import {
  E2E_PROFILE,
  decisionsReply,
  type MockGatewayProfile,
} from "./profiles";

/**
 * Public surface of the mock for the tests that assert on its fixtures. They
 * live in `./profiles.ts` (next to the reply that serves them) and stay
 * importable from here, the module the harness already depends on.
 */
export {
  MOCK_IMAGE_PNG_BASE64,
  SLOW_STREAM_CHUNK_MS,
  SLOW_STREAM_CHUNKS,
  SLOW_STREAM_TEXT,
} from "./profiles";

export const MOCK_GATEWAY_PORT = 4001;

/**
 * Builds the toolkit scenario of one profile. The catalog is registered once
 * here (the same one for every profile); the responders answer from the request
 * alone and an unlisted model id surfaces as the toolkit's `422`.
 */
export function createMockGatewayScenario(
  profile: MockGatewayProfile,
): GatewayScenario {
  return createGatewayScenario({
    catalog: { public: TEST_MODELS, internal: TEST_INTERNAL_MODELS },
    chat: (request) => profile.chat[request.model ?? ""]?.(request),
    embeddings: profile.embeddings,
    rerank: profile.rerank,
    decisions: (request) => decisionsReply(profile.decisions, request),
    speech: profile.speech,
  });
}

/**
 * The scenario the `:4001` mock serves. Exported so in-process tests can run
 * the very same definitions through MSW (`mockGatewayScenario.handlers`) and
 * observe the recorded requests (`mockGatewayScenario.requests`).
 */
export const mockGatewayScenario = createMockGatewayScenario(E2E_PROFILE);

// ---------------------------------------------------------------------------
// Canonical `:4001` process lifecycle (chatbot-owned)
// ---------------------------------------------------------------------------

export interface MockGatewayHandle {
  port: number;
  /** false if the port already had a mock listening and it was reused. */
  started: boolean;
}

let running: { server: GatewayServer; port: number } | undefined;

const probeTimeoutMs = 500;
const ensureTimeoutMs = 10_000;

/** Is a Mock Model Gateway (this same mock) already listening on the port? */
export async function isMockGatewayAlive(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${HEALTH_PATH}`, {
      signal: AbortSignal.timeout(probeTimeoutMs),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { mock?: string };
    return body.mock === "model-gateway";
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Guarantees a mock listening on `port`, idempotent and safe against concurrent
 * processes:
 * 1. if this process already has one, it reuses it;
 * 2. if ANOTHER process already serves the mock (probe to the health endpoint),
 *    it reuses it;
 * 3. otherwise it listens on the port; if it loses the race (EADDRINUSE), it
 *    waits for the winner to be probeable and reuses it.
 */
export async function ensureMockGateway(
  options: { port?: number } = {},
): Promise<MockGatewayHandle> {
  const port = options.port ?? MOCK_GATEWAY_PORT;
  if (running?.port === port) return { port, started: false };

  if (await isMockGatewayAlive(port)) return { port, started: false };

  const deadline = Date.now() + ensureTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const server = await startGatewayServer(mockGatewayScenario, {
        port,
        host: "127.0.0.1",
      });
      running = { server, port: server.port };
      return { port: server.port, started: true };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE") throw error;
      // Another process won the port: wait until its mock is probeable.
      if (await isMockGatewayAlive(port)) return { port, started: false };
      await sleep(100);
    }
  }
  throw new Error(
    `ensureMockGateway: port ${port} is still busy without a probeable mock after ${ensureTimeoutMs}ms`,
  );
}

/** Closes THIS process's mock (other processes' mocks do not belong to us). */
export async function stopMockGateway(): Promise<void> {
  if (!running) return;
  const { server } = running;
  running = undefined;
  await server.close();
}
