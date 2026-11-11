# Verified codebase facts for Tool Pruning implementation

All facts below were verified against the working tree (2025-11-11). Cite these instead of re-deriving.

## Pi SDK (`@earendil-works/pi-coding-agent@0.85.1`)

- `pi.on("context", handler)` — `ContextEvent { type: "context"; messages: AgentMessage[] }`; handler can return `ContextEventResult` (replace payload). Fired before each LLM call.
- `pi.on("before_agent_start", handler)` — `BeforeAgentStartEvent { prompt, images?, systemPrompt, systemPromptOptions }`.
- `pi.on("session_compact", handler)` — `SessionCompactEvent { compactionEntry, fromExtension, reason: "manual"|"threshold"|"overflow", willRetry }`.
- `pi.appendEntry(customType: string, data?: T)` — writes a `custom` session entry (persisted in the tree, never becomes an AgentMessage).
- `ctx.getSignal(): AbortSignal | undefined` — current turn signal.
- `ctx.sessionManager` exposes `getLeafId(): string | null`, `getBranch(fromId?): SessionEntry[]`, `getEntries()`, `getSessionId()`, `getCwd()`.
- Token estimation: `calculateContextTokens(usage: Usage): number` and `estimateTokens(message: AgentMessage): number` exported from `@earendil-works/pi-coding-agent` (core/compaction/compaction).
- Extensions are loaded through jiti in a separate module runtime — extensions must NOT import worker `src/` modules directly (duplicate state). Use a `Symbol.for("...")` bridge on `globalThis`. Pattern reference: `packages/coding-agent/src/subagent/subagent-bridge.ts` (worker side publishes, extension resolves at call time; module must stay free of worker imports).

## Worker runtime wiring

- `packages/coding-agent/src/runtime/pi-packages.ts`: `getFirstPartyExtensionPaths()` auto-discovers every `extensions/<name>/index.ts` directory — creating `extensions/tool-pruning/index.ts` is enough; no list to edit. `getExtensionPaths({ includeSubagentExtension: false })` is used for subagent (child) sessions — note: that filter only excludes `subagent` by name, so tool-pruning IS loaded in subagent sessions too (spec wants this).
- `WorkerRuntimeConfig` (`src/runtime/runtime-config.ts`) — add optional `toolPruning` overrides there; `createTestWorkerContext(overrides)` (`tests/helpers/test-context.ts`) passes `Partial<TestWorkerContextPaths & WorkerRuntimeConfig>` straight into `workerConfig`.
- Runtime factory (`src/runtime/runtime-factory.ts`) passes `additionalExtensionPaths: getExtensionPaths(...)`.

## Model Gateway JS toolkit (`packages/model-gateway/js`)

- `js/src/scenario.ts` routes `POST /v1/decisions` AND `POST /v1/systemone` to `config.decisions` (line ~193).
- `js/src/protocol.ts` `decisionsResponse(request, options)` currently renders only `type: "choice"` questions; options: `{ model?, provider?, choices?, answerFields? }`. It skips non-choice questions silently. To extend: support `type: "noul"` questions answering with a numeric probability in `[0,1]` (default `0.5`), plus a declarative `nouls?: Readonly<Record<string, number>>` override validated against the `request.questions` keys (invalid key => throw, following the existing `choices` convention).
- Tests live in `js/tests/unit/protocol.test.ts` and `js/tests/unit/scenario.test.ts`; MSW harness in `js/src/msw.ts`, standalone server `js/src/server.ts` (Mock Gateway :4001).

## Gateway decisions API (shape)

- Request: `{ model, questions: Record<string, { type, criteria, ... }>, ... }`. Response: `{ answers: Record<name, answerBody>, model, provider, usage: { cost } }`. For `noul` questions the answer body carries a numeric probability (see spec D5/D6 for defensive validation: missing key => default `1.0` => keep).

## Testing conventions

- Unit tests: `packages/coding-agent/tests/unit/pruning/`. Run focused: `pnpm --filter coding-agent test:unit tests/unit/pruning/<file>.test.ts`.
- `tests/unit/architecture/no-process-env-mutations.test.ts` forbids `process.env` mutation — config must flow through `ctx.model`, `ctx.modelRegistry.getApiKeyAndHeaders(ctx.model)` and the pruning bridge, never `process.env`.
- Session integration tests use `createTestWorkerContext()` + `setupWorkerGatewayHarness()` (MSW). Search `tests/` for an example of the harness before writing.

## Model fields

- `ctx.model.baseUrl` points at `${gatewayUrl}/v1` (sandbox or active Environment); `ctx.model.contextWindow` is the window size; `ctx.modelRegistry.getApiKeyAndHeaders(ctx.model)` yields credentials without touching `process.env` (ADR 0011/0014).

## Production guardrails (from AGENTS.md)

- Never `pnpm build`; verify with `pnpm build:verify`. Never restart pm2 services. Iterate with `pnpm dev` if needed.
- Commit trailer: `Co-Authored-By: GLM 5.3 Flash`.
