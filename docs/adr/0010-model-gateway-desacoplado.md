---
status: accepted
---

# Decoupled Model Gateway, runtime catalog, and removal of `packages/models` and `packages/inference`

Supersedes [ADR 0008](./0008-inference-kit-fachada-sobre-ai-sdk.md). Amended by [ADR 0011](./0011-config-tipado-por-entorno.md) (typed per-Environment configuration) and [ADR 0013](./0013-model-gateway-testing-and-social-unit-tests.md) (official Gateway testing toolkit and consumer-owned test scenarios).

## Decision

We extract all AI provider management, third-party credentials, and the **Model Catalog** definition into a standalone machine service (**Model Gateway**, implemented in `packages/model-gateway` with an independent Python runtime and deployed as a `systemd` unit).

1. **Stateless LiteLLM Proxy + FastAPI wrapper (`packages/model-gateway`)**:
   - Runs LiteLLM Proxy without a database (`config.yaml` as the single source of truth).
   - Leverages native LiteLLM support (`>= v1.104.2`) for all system operations, including `/v1/chat/completions`, `/v1/embeddings`, `/v1/rerank`, `/v1/audio/speech`, and the native Decisions API (`/v1/decisions` and `/v1/systemone`).
   - A FastAPI micro-entrypoint (`server.py`) wraps the LiteLLM app solely to expose the **Model Catalog** endpoint (`GET /v1/models/catalog`), filtering `user_invocable: true` models **server-side** and returning their clean metadata schema (`id`, `company`, `contextWindow`, `maxTokens`, `cost`, `reasoning`, `thinkingLevels`, `defaultThinkingLevel`, `supportedFiles`, `supportedOutput`, `zeroDataRetention`, `temperature`, `topP`, `topK`, `isDefault`).
   - Exposes all language models under a single dialect (`openai-completions`) to consumers (`chatbot`, `coding-agent`, and any other applications on the machine).

2. **Third-party API key custody via `systemd-creds` in the Gateway**:
   - All external provider API keys are removed from repository files and `~/.pi/agent/auth.json`; they are stored exclusively encrypted with `systemd-creds encrypt` (`/etc/model-gateway/creds/*.cred`) via an interactive wizard and injected via `LoadCredentialEncrypted=` in `model-gateway.service`, which runs with `DynamicUser=yes` (transient UID per boot) and `ProtectHome=yes` over `/opt/model-gateway` deployed by `scripts/deploy.sh` (health check + `--ref` for rollback): not even another process owned by the operator user can read `$CREDENTIALS_DIRECTORY`.
   - In `ai-chatbot` (`packages/config`), application settings (`postgresUrl`, `authSecret`, `modelGatewayUrl`, `modelGatewayApiKey`, etc.) remain in the application's configuration layer (subsequently converted to typed per-Environment TypeScript modules in [ADR 0011](./0011-config-tipado-por-entorno.md)) and do not require `systemd-creds`.

3. **Dual model consumption and end of static typing (`packages/models` removed)**:
   - Model identifiers are no longer TypeScript literal unions (`InvocableModelId` is removed; `modelId` becomes `string`).
   - **User-selectable models (at runtime)**: `chatbot` queries the Gateway's catalog endpoint on the server (with in-memory caching) and hydrates `"use client"` components via `<ModelCatalogProvider>` in the `(chat)` layout. `coding-agent` queries that same endpoint and writes its Environment's `models.json` with a single provider (`model-gateway`): lazily on first `ModelRuntime` construction, and again on **every `getAvailableModels`** (in-flight deduplication; if the Gateway is unreachable, the last good catalog is kept) — a model added to `config.yaml` appears in the coding chat picker without restarting the worker.
   - **Internal hardcoded uses (`Default Model Contracts`)**: internal features invoke stable contract names guaranteed by the Gateway (`fast-default`, `flash-default`, `vision-default`, `reasoning-default`, `free-default`, `image-default`, `embedding-default`, `rerank-default`, `decision-default`, `tts-default`).

4. **Removal of `packages/inference` and Gateway HTTP testing boundary**:
   - Once the Gateway absorbs the 12 provider clients and `packages/models` is gone, `packages/inference` would be reduced to a pass-through module consumed only by `chatbot`. The package is removed and the thin AI SDK client + Gateway call layer (~250 lines) lives in `packages/chatbot/lib/infrastructure/ai/`.
   - Rather than branching production code with `isTestMode()` to inject in-memory mocks, tests substitute the Gateway at its HTTP contract boundary: in the Test Environment (`config.test.ts`), `modelGatewayUrl` points to `:4001`. Per [ADR 0013](./0013-model-gateway-testing-and-social-unit-tests.md), an official JavaScript testing package associated with `packages/model-gateway` provides reusable protocol fixtures, MSW handlers (for in-process social unit tests), and the Node HTTP server (for out-of-process/E2E tests), while test capability catalogs (`basicChat`, `basicChatAlt`, `canExecuteTools`, `canSeeImages`, `canProduceReasoning`, `alwaysRefuses`, `failsMidStream`, `slowStream`) and application-specific scenarios remain owned by each consumer (`chatbot` and `coding-agent`).

## Considered Options

- **Bifrost (Go) or Portkey Gateway (Node.js) vs. LiteLLM Proxy**: rejected because LiteLLM in stateless mode (`config.yaml`) is the only option natively covering `/v1/chat/completions`, `/v1/embeddings`, `/v1/rerank`, `/v1/audio/speech`, cross-provider `reasoning_effort`/`thinking` translation, and arbitrary metadata in `model_info`.
- **Filtering `user_invocable` in the consumer against raw `GET /v1/model/info`**: rejected because it couples every consuming application to the Gateway's internal models and LiteLLM's internal structure.
- **Keeping thinned-out `packages/models` and `packages/inference`**: rejected to avoid shallow modules with a single real consumer (`chatbot`) and confusing names once the catalog and providers live in the Gateway service.
- **Putting application-specific test catalogs inside `packages/model-gateway`**: rejected because the test capability catalog and E2E scenario definitions belong to `ai-chatbot`'s tests, not to the shared machine infrastructure service. Reusable protocol testing mechanisms (fixtures, MSW handlers, HTTP server lifecycle) do belong in the official Gateway testing package ([ADR 0013](./0013-model-gateway-testing-and-social-unit-tests.md)).

## Consequences

- `packages/models` and `packages/inference` are removed from the workspace; `packages/model-gateway` is added (its Python service runtime has zero Node/workspace dependencies and remains extractable with `mv` + `git init`, while offering an optional JS testing toolkit for consumers per [ADR 0013](./0013-model-gateway-testing-and-social-unit-tests.md)).
- `packages/config` removes the 10 external provider API keys and adds `modelGatewayUrl` and `modelGatewayApiKey`, alongside a guardrail in `guardrails.ts` ensuring the `test` Environment points exclusively to the Mock Model Gateway port (`:4001`).
- `isTestMode()` in `packages/chatbot/lib/infrastructure/ai/`, the indirect `CAPABILITY_ALIASES` map over commercial models, and the static build script `packages/coding-agent/scripts/generate-models.ts` are removed.
