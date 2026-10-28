/**
 * Test catalog of the Mock Model Gateway (ADR 0010, ticket 02).
 *
 * Unlike the real catalog (LiteLLM `config.yaml` → commercial models), here the
 * entries ARE the capabilities the tests need: the id is the behavior alias and
 * there is no indirection map towards commercial ids. The schema of each entry
 * is exactly the `GatewayModelEntry` from
 * `packages/config/src/gateway-contract.ts` (see
 * `packages/model-gateway/CONTRACT.md`, which mirrors spec §2.2):
 * `GET /v1/models/catalog` filters the user-invocable ones on the server (the 7
 * capability ones) and the internal ones (`*-default`) only come out with
 * `?include_internal=true`.
 */

import type { GatewayModelEntry } from "config";

/** Catalog entry with the exact schema of the shared contract (§1). */
export type MockCatalogEntry = GatewayModelEntry;

/** Deterministic base entry: the tests only look at the properties they assert. */
const entry = (overrides: Partial<MockCatalogEntry> & { id: string }): MockCatalogEntry => ({
  company: "mock",
  isDefault: false,
  contextWindow: 128000,
  maxTokens: 8192,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  reasoning: false,
  thinkingLevels: [],
  defaultThinkingLevel: null,
  supportedFiles: [],
  supportedOutput: ["text"],
  zeroDataRetention: true,
  temperature: 0.6,
  topP: null,
  topK: null,
  ...overrides,
});

/**
 * The 7 user-invocable models of the test catalog. Invariants the e2e consume
 * directly (no alias layer — the ids ARE the capabilities):
 * - `basicChat` is the `isDefault` one (and its temperature 0.6 differs from
 *   `alwaysRefuses`'s — settings.spec switches model and expects another value).
 * - `canSeeImages` declares `supportedFiles: ["img"]` (attachments.spec).
 * - `canProduceReasoning` declares `reasoning: true` + thinking levels.
 * - `canExecuteTools` and `failsMidStream` need no catalog flags: their
 *   behavior lives in the `/v1/chat/completions` handler.
 * - `slowStream` paces its SSE chunks (~350 ms apart, `SLOW_STREAM_CHUNKS`
 *   text) so the e2e resume suite can cut the connection mid-generation and
 *   find the turn still alive on the server.
 *
 * The catalog is registered once when the `:4001` scenario is built and never
 * mutated per test: the application caches it per process
 * (`lib/infrastructure/ai/catalog.ts`), so a mid-run change would leak into
 * later journeys. Add an entry here (and its answer in `./profiles.ts`), not in
 * a test.
 */
export const TEST_MODELS: MockCatalogEntry[] = [
  entry({ id: "basicChat", isDefault: true }),
  entry({ id: "basicChatAlt", temperature: 0.7 }),
  entry({ id: "canExecuteTools" }),
  entry({ id: "canSeeImages", supportedFiles: ["img"] }),
  entry({
    id: "canProduceReasoning",
    reasoning: true,
    thinkingLevels: ["low", "medium", "high"],
    defaultThinkingLevel: "medium",
  }),
  entry({ id: "alwaysRefuses", temperature: 1 }),
  entry({ id: "failsMidStream" }),
  entry({ id: "slowStream" }),
];

/**
 * The Default Model Contracts (spec §2.4): `user_invocable: false` in the real
 * Gateway, so the mock hides them from the default listing as well. They are
 * always accepted as `model` in `/v1/chat/completions` and friends.
 */
export const TEST_INTERNAL_MODELS: MockCatalogEntry[] = [
  "fast-default",
  "flash-default",
  "vision-default",
  "reasoning-default",
  "free-default",
  "image-default",
  "embedding-default",
  "rerank-default",
  "decision-default",
  "tts-default",
].map((id) => entry({ id }));

export const isTestModel = (id: string): boolean =>
  TEST_MODELS.some((m) => m.id === id) ||
  TEST_INTERNAL_MODELS.some((m) => m.id === id);
