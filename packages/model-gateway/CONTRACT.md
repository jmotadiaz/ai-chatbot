# Model Gateway — Shared catalog contract

Source of truth for this document: `.scratch/model-gateway/spec.md` §2.2 and
[ADR 0010](../../docs/adr/0010-model-gateway-desacoplado.md). Both sides of the
contract (the Python service and the TypeScript consumers) reference this
file as the single versioned schema:

- Python side: `packages/model-gateway/catalog.py` (`build_entry`).
- TypeScript side: `packages/config/src/gateway-contract.ts` (`GatewayModelEntry`),
  re-exported/consolidated in `packages/chatbot` (facade and mock) and
  `packages/coding-agent` (runtime catalog of the worker).

## `GET /v1/models/catalog`

Authenticated (`Authorization: Bearer <MODEL_GATEWAY_API_KEY>`). It filters on the
SERVER: only entries with `model_info.user_invocable == true`, unless
`?include_internal=true` (inspection of the Default Model Contracts
`*-default`). It never exposes `litellm_params` nor raw `model_info`.

Deterministic order: the `isDefault` entry first, the rest alphabetical
(case-insensitive by `id`). The order of `model_list` in `config.yaml` is
irrelevant: `build_catalog` (`catalog.py`) imposes it and all the consumers
(Model Picker, coding-agent) inherit it as is.

Response:

```json
{
  "models": [
    {
      "id": "Kimi K3",
      "company": "Moonshot",
      "isDefault": true,
      "contextWindow": 262144,
      "maxTokens": 32768,
      "cost": { "input": 0.6, "output": 2.5, "cacheRead": 0.15, "cacheWrite": 0 },
      "reasoning": true,
      "thinkingLevels": ["low", "medium", "high"],
      "defaultThinkingLevel": "medium",
      "supportedFiles": ["img", "pdf"],
      "supportedOutput": ["text"],
      "zeroDataRetention": false,
      "temperature": 0.6,
      "topP": 0.95,
      "topK": null
    }
  ]
}
```

## `GatewayModelEntry` (schema)

| Field | Type | Notes |
| :--- | :--- | :--- |
| `id` | `string` | Stable name; in Pi and in the consumers it is the model id 1:1. |
| `company` | `string` | Free-form (it is no longer a typed union). |
| `isDefault` | `boolean` | The picker uses the non-contract `isDefault` entry. |
| `contextWindow` | `number \| null` | `null` in sparse entries (embedding/rerank/tts); consumers fall back to their default (`DEFAULT_CONTEXT_WINDOW` / 128k in Pi). |
| `maxTokens` | `number \| null` | Same (16k fallback in Pi). |
| `cost` | `GatewayModelCost` | `{ input, output, cacheRead, cacheWrite }`, USD per million tokens (LiteLLM serves per token; the catalog re-expresses per million). |
| `reasoning` | `boolean` | |
| `thinkingLevels` | `string[]` | Supported reasoning levels (`off` is not listed: absent = no `reasoning_effort`). |
| `defaultThinkingLevel` | `string \| null` | |
| `supportedFiles` | `("img" \| "pdf")[]` | |
| `supportedOutput` | `("text" \| "img")[]` | |
| `zeroDataRetention` | `boolean` | |
| `temperature` | `number \| null` | Sampling default of the model. |
| `topP` | `number \| null` | |
| `topK` | `number \| null` | |

## Default Model Contracts (`user_invocable: false`)

Stable names that the features invoke directly, guaranteed by the
Gateway (full table in the spec §2.4): `fast-default`, `flash-default`,
`vision-default`, `reasoning-default`, `free-default`, `image-default`,
`embedding-default`, `rerank-default`, `decision-default`, `tts-default`.
They only appear in the catalog with `?include_internal=true`.

The image contract (`image-default`) is served by `/v1/chat/completions`
with `modalities: ["image", "text"]` pinned in `config.yaml` and it answers with
a multipart message (`{type:"text"}` + `{type:"image_url", image_url:{url:"data:…;base64,…"}}`);
it is consumed by the dedicated transport
`packages/chatbot/lib/infrastructure/ai/gateway-image-model.ts`.

## Model aliases (routing only)

`config.yaml` → `router_settings.model_group_alias` declares stable
family/tier names (full semantics in the spec §2.6). They are not part of the
catalog schema: `GET /v1/models/catalog` does not return them even with
`?include_internal=true`; catalog consumers keep using the canonical `id`.
They are accepted as `model` in the LiteLLM routes and are re-pointed in
`config.yaml` when the model version changes.

| Alias | Target (canonical id) |
| :--- | :--- |
| `deepseek-flash` | `Deepseek v4.1 Flash` |
| `glm-flash` | `GLM 5.3 Flash` |
| `glm-pro` | `GLM 5.3` |
| `mimo-flash` | `MiMo V2.6 Flash` |
| `mimo-pro` | `MiMo V2.6 Pro` |
| `meta-muse-spark` | `Muse Spark 1.3` |
| `free` | `Beam Free` |

There is no `deepseek-pro` alias because the Gateway does not declare a Pro tier
for Deepseek (only `deepseek-v4.1-flash`).
