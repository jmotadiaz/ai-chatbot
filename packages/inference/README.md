# inference — Inference Kit

Server/Node package: a **thin facade over the AI SDK**, not an anti-corruption
layer. It owns provider clients, key handling, retry and the lazy resolution
from a Model Catalog id (or Model Role) to a ready-to-use configuration; it
does not invent its own message, tool, stream or agent-loop types, and it
never wraps `generateText`/`streamText` — callers keep using those directly
with whatever this package resolves for them.

## Responsibility

- **Clients per endpoint kind.** One lazy, memoized client builder per
  `ProviderKind` (`src/clients/*.ts`, assembled by `buildDefaultClients()` in
  `src/clients/index.ts`), plus separate, smaller client registries for
  embedding, rerank, decisions and speech — none of those four are a
  `ProviderKind` (see "Endpoint kind vs `ProviderKind`" below). Every API key
  is read through `config` (`packages/config`) and passed explicitly to the
  SDK constructor; no SDK is left to read `process.env` implicitly.
- **Resolution.** `languageModel(idOrRole, options?)` turns a Model Catalog id
  — or a Model Role from `LANGUAGE_MODEL_ROLES` (`models`) — into a
  `ModelConfiguration` (the constructed model plus temperature/topP/topK/
  contextWindow/providerOptions/company/capability flags), building and
  memoizing the underlying client only on first use, once per kit instance.
  `speechModel(idOrRole)` does the same for `SPEECH_MODELS`/`SPEECH_ROLES`.
- **Cross-cutting operations that add real value:** `embed`, `rerank`,
  `decide` (the OpenRouter Decisions API, with provenance: choice,
  confidence, probabilities, modelId, provider, latency, cost) and
  `createAgent` (a `ToolLoopAgent` built from a resolved model, traced when
  `TRACE_ENABLED=1`). `createAgentModel(idOrRole, options?)` exposes that same
  traced `ModelConfiguration` on its own, for a caller that needs the model
  itself rather than a `ToolLoopAgent` (a consumer's own agent class — the
  chatbot's Context7 branch is the one call site today). These exist because
  they add something beyond what the AI SDK already gives you
  (catalog-driven dimensions/taskType, a timeout and
  a stable provenance shape, tracing wiring) — nothing else gets a kit-level
  wrapper.
- **Built with `createInferenceKit(options?)`.** Every call returns an
  independent kit: its own client registries (real by default, overridable
  per kind or per catalog entry via `options`) and its own memoization cache.
  Importing the package or calling `createInferenceKit()` builds nothing —
  every client and every `ModelConfiguration` is constructed lazily, on first
  use. A default instance, `inferenceKit`, is exported for convenience; it is
  just `createInferenceKit()` called once.

## Dependency rule

- **`packages/inference` → `models`, `config`, `tracing`.** Nothing else.
- **The client bundle and Pi's agent loop only ever see `models`.** `models`
  stays isomorphic data with no dependencies of its own, so it is safe in a
  browser bundle; this package is where the same catalog turns into real SDK
  clients, and it is never meant to reach a client component or Pi's agent
  loop (Pi runs on `pi-ai`, not the AI SDK — see ADR 0002).
- **Nobody outside this package imports a provider SDK.** `@ai-sdk/<vendor>`,
  `@openrouter/ai-sdk-provider` and `@openrouter/sdk` are this package's
  exclusive concern; `ai`, `@ai-sdk/react` and `@ai-sdk/provider` are not
  vendor-specific and stay allowed everywhere. Enforced in the chatbot by a
  `no-restricted-imports` rule in `packages/chatbot/eslint.config.mjs` (this
  package's own lint, on the root config, has no reason to restrict its own
  dependencies).
- **A `"use client"` file never imports this package (or its `/testing`
  subpath), nor the consuming app's composition root.** Enforced in the
  chatbot by a local ESLint rule (`local/no-inference-in-client-components`
  in `packages/chatbot/eslint.config.mjs`) that reads a file's directive
  prologue for `"use client"` and, only then, checks its imports — flat
  config can select files by path, never by content, so this could not be a
  `files` glob. The rule also rejects a **type-only** import of this package
  from a client file: a client component's UI-safe model data (invocable
  model ids, per-model capabilities, the default model) belongs in the
  consuming app's own isomorphic config module instead (the chatbot's is
  `lib/features/foundation-model/config.ts`, which depends only on `models`).
- **No `server-only`.** Next's `server-only` marker does not exist under a
  plain `tsx` process, and this package must stay importable from one (see
  "Runtime assumptions"). The server/Node boundary is convention plus the two
  lint rules above, not a runtime import guard.

## Runtime assumptions

This package assumes **Node**, not "any JavaScript runtime": it uses
`randomUUID` and `tracing`'s `AsyncLocalStorage`-based trace context. It has
no Next.js-specific constructs, so it is importable from a plain Node/tsx
process with no bundler in the picture — proved by
`packages/coding-agent/tests/contract/inference-import.test.ts`, which
imports both `inference` and `inference/testing` from the worker's own plain
`tsx` setup and exercises the returned kit's shape. The coding-agent worker
**depends on this package today only to keep that contract test passing**; it
does not call the kit from any real code path yet (out of scope per the
spec — "se garantiza la importabilidad", not consumption).

## Package layout

```
src/
  types.ts            Public types: ModelConfiguration, ProviderOptions, InferenceKit, ...
  kit.ts               createInferenceKit(options) + the default `inferenceKit` instance
  language-model.ts    catalog/role id -> ModelConfiguration, memoized per kit instance
  embed.ts / rerank.ts / decide.ts / create-agent.ts / speech-model.ts
                       one module per cross-cutting operation
  retrying-fetch.ts    createRetryingFetch: retries a transient 5xx with backoff
  clients/             one module per endpoint kind, plus embedding/rerank/decisions/speech
  testing/             inference/testing subpath — see below
  index.ts             public barrel
```

## How to add things

- **A new endpoint kind for a language model** (a new `ProviderKind` in
  `models`): add `src/clients/<kind>.ts` exporting a `buildXClient()` built
  from `buildLazyLanguageModelClient` (`src/clients/lazy-client.ts`) — pass it
  a `() => createX({ apiKey: config.xApiKey(), ... })` factory and it returns
  the lazy, memoized `(modelId: string) => LanguageModelV3` every client here
  needs, reading any key via `config`; wire it into `buildDefaultClients()` in
  `src/clients/index.ts`. `ProviderKind`/`InferenceClients` stay
  language-model-only — embedding, rerank, decision and speech kinds each get
  their **own** kind union and client registry next to their catalog in
  `models` (`EmbeddingProviderKind`, `RerankProviderKind`,
  `DecisionProviderKind`, `SpeechProviderKind`); do not fold them into
  `ProviderKind` (that would force a language-model client for them and touch
  Pi's `toPiProviderId`, which only ever maps language-model kinds).
- **A new Model Role** (a named pointer to a catalog id for an internal,
  non-selectable feature): add it to the matching `*_ROLES` map in `models`
  (`LANGUAGE_MODEL_ROLES`, `EMBEDDING_ROLES`, `RERANK_ROLES`,
  `DECISION_ROLES`, `SPEECH_ROLES` — the flat union of all of them is
  `MODEL_ROLES`/`ModelRole` in `models/src/roles.ts`), pointing at an id that
  already exists in the relevant catalog. Nothing in this package changes:
  `languageModel`/`speechModel`/`embed`/`rerank`/`decide` already accept
  either an id or a role for their respective catalog, resolved through
  `models`'s shared `resolveCatalogEntry` (a role-or-id lookup against a
  `Map`, throwing a descriptive error when the resolved id has no entry — see
  `src/language-model.ts` for the reference usage). Roles must stay disjoint
  across the maps.
- **A new operation** (beyond `embed`/`rerank`/`decide`/`createAgent`): one
  module in `src/` exporting a `createXResolver(...)`-style factory shaped
  like `createLanguageModelResolver` (`src/language-model.ts`); wire its
  return value into `createInferenceKit`'s returned object in `src/kit.ts`,
  and add the corresponding members to `InferenceKit`/
  `CreateInferenceKitOptions` in `src/types.ts`. Only wrap something that adds
  real value beyond what `generateText`/`streamText` already give you — see
  "Responsibility" above.
- **A new mock behaviour** (for `inference/testing`): add a file under
  `src/testing/` exporting a `MockModelEntry` (`{ capabilities,
  languageModel }`), named after the behaviour, and export it from
  `src/testing/index.ts`. It must carry **no model id** — binding a behaviour
  to a real, selectable catalog id is entirely a consumer concern (in the
  chatbot: `tests/mocks/ai/capabilities.ts`'s `CAPABILITY_ALIASES` /
  `ALIAS_BEHAVIOURS`, documented in `packages/chatbot/tests/AGENTS.md`).

## Composition root pattern

This package has **no knowledge of test environments** — it never reads
`NEXT_PUBLIC_ENV` or any other "are we in a test" signal, and imports no test
code. Real-vs-mock is a decision for the **consuming app's composition
root**, one module that calls `createInferenceKit({ clients, embeddingClients,
rerankClients, decisionsClients, decide })` with a client registry built from
mocks when the app is in test mode, or uses the exported default `inferenceKit`
otherwise. The chatbot's composition root is
`packages/chatbot/lib/infrastructure/ai/inference-kit.ts` — the **only**
chatbot module that picks real vs. mock, and the module every feature imports
`inferenceKit`/`speechModel` from directly (there is no transitional reexport
left anywhere in the chatbot: `lib/infrastructure/ai/providers.ts` and
`lib/features/foundation-model/server.ts` existed only for that purpose while
features migrated, and both are gone as of this package's contract phase).
A future consumer (e.g. the coding-agent worker, if it starts a real call
site) needs the same shape: one composition-root module, its own real/mock
choice, and every other module importing that module instead of `inference`
directly.

## Testing (`inference/testing`)

A separate subpath (`package.json`'s `exports["./testing"]`) with AI SDK mock
builders that carry no model id: `createMockModel`/`createMockEmbeddingModel`/
`createMockSpeechModel` (generic, content-driven), `createMockRerankModel`,
chunk/stream builders (`textChunks`, `reasoningChunks`, `toolCallChunks`,
`fileChunks`, `errorChunk`, `finishChunk`, and their `*Stream` counterparts),
and five ready-made behaviours (`MOCK_TOOL_EXECUTION`, `MOCK_VISION`,
`MOCK_REASONING`, `MOCK_REFUSAL`, `MOCK_MID_STREAM_ERROR`). It exists as its
own subpath so the coding-agent worker can reuse the exact same mocks the
chatbot uses, without either one depending on the other's test code.

## Scripts

`lint` / `lint:fix` (root ESLint config — no per-package restrictions; the two
dependency-boundary rules above live in the chatbot's own config, since that
is the one place they need enforcing today), `type:check`, `test:unit`,
`test:contract`. There is no `test:component` or `test:integration` script:
this package has no rendered UI and nothing that needs multi-module
in-process infrastructure beyond what its contract tests already cover.
