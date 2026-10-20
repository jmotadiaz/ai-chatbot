# coding-agent

HTTP worker that wraps `@earendil-works/pi-coding-agent`. Manages coding agent sessions, translates Pi events into AG-UI protocol events, and exposes an `/rpc` endpoint. See `AGENTS.md` for architecture and environment details.

## Runtime model catalog (Model Gateway — ADR 0010)

The worker no longer generates `models.json` at build/dev time (`scripts/generate-models.ts` is gone; there is no dependency on `packages/models`). On **startup**, before `ModelRuntime.create()`, the worker synchronizes the catalog in runtime:

1. `GET ${MODEL_GATEWAY_URL}/v1/models/catalog` with `Authorization: Bearer ${MODEL_GATEWAY_API_KEY}` (both from `packages/config`).
2. Materializes the Pi `models.json` (`getModelsJsonPath()`) with a **single provider** `model-gateway` (`baseUrl: ${MODEL_GATEWAY_URL}/v1`, `api: "openai-completions"`, `apiKey: "$MODEL_GATEWAY_API_KEY"`); each catalog entry maps 1:1 to a Pi model (Pi model id = catalog id).
3. Ensures the `model-gateway` credential in `getAuthJsonPath()` (creates the file, preserves other entries).
4. Caches the synced catalog in process memory — it is the source of the thinking levels `getAvailableModels` exposes.

**Consequence:** dev (`pnpm --filter coding-agent dev`, port 3016) and the prod `preview` need the Model Gateway **alive** (`model-gateway.service` on `:4000`; in test, the Mock Model Gateway of the chatbot on `:4001`). If it does not answer, the worker fails fast with an actionable error instead of booting with an empty model list.
