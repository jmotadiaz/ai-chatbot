# Model Gateway — Contrato compartido del catálogo

Fuente de verdad de este documento: `.scratch/model-gateway/spec.md` §2.2 y
[ADR 0010](../../docs/adr/0010-model-gateway-desacoplado.md). Ambos lados del
contrato (el servicio Python y los consumidores TypeScript) referencian este
fichero como schema único versionado:

- Lado Python: `packages/model-gateway/catalog.py` (`build_entry`).
- Lado TypeScript: `packages/config/src/gateway-contract.ts` (`GatewayModelEntry`),
  re-exportado/consolidado en `packages/chatbot` (fachada y mock) y
  `packages/coding-agent` (catálogo en runtime del worker).

## `GET /v1/models/catalog`

Autenticado (`Authorization: Bearer <MODEL_GATEWAY_API_KEY>`). Filtra en el
SERVIDOR: solo las entradas con `model_info.user_invocable == true`, salvo
`?include_internal=true` (inspección de los Default Model Contracts
`*-default`). Nunca expone `litellm_params` ni `model_info` crudo.

Respuesta:

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

| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `string` | Nombre estable; en Pi y en los consumidores es el model id 1:1. |
| `company` | `string` | Libre (ya no es una unión tipada). |
| `isDefault` | `boolean` | El picker usa la entrada `isDefault` no-contrato. |
| `contextWindow` | `number \| null` | `null` en entradas sparse (embedding/rerank/tts); los consumidores caen a su default (`DEFAULT_CONTEXT_WINDOW` / 128k en Pi). |
| `maxTokens` | `number \| null` | Ídem (fallback 16k en Pi). |
| `cost` | `GatewayModelCost` | `{ input, output, cacheRead, cacheWrite }`, USD por millón de tokens (LiteLLM sirve por token; el catálogo re-expresa por millón). |
| `reasoning` | `boolean` | |
| `thinkingLevels` | `string[]` | Niveles de razonamiento soportados (`off` no se lista: ausente = sin `reasoning_effort`). |
| `defaultThinkingLevel` | `string \| null` | |
| `supportedFiles` | `("img" \| "pdf")[]` | |
| `supportedOutput` | `("text" \| "img")[]` | |
| `zeroDataRetention` | `boolean` | |
| `temperature` | `number \| null` | Default de muestreo del modelo. |
| `topP` | `number \| null` | |
| `topK` | `number \| null` | |

## Default Model Contracts (`user_invocable: false`)

Nombres estables que las features invocan directamente, garantizados por el
Gateway (tabla completa en la spec §2.4): `fast-default`, `flash-default`,
`vision-default`, `reasoning-default`, `free-default`, `image-default`,
`embedding-default`, `rerank-default`, `decision-default`, `tts-default`.
Solo aparecen en el catálogo con `?include_internal=true`.

El contrato de imagen (`image-default`) se sirve por `/v1/chat/completions`
con `modalities: ["image", "text"]` fijadas en `config.yaml` y responde con
un mensaje multipart (`{type:"text"}` + `{type:"image_url", image_url:{url:"data:…;base64,…"}}`);
lo consume el transport propio
`packages/chatbot/lib/infrastructure/ai/gateway-image-model.ts`.
