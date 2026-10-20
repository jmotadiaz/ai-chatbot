# 02: `Mock Model Gateway` (`:4001`) en `ai-chatbot` y variables en `packages/config`

**What to build:** Añadir las variables `MODEL_GATEWAY_URL` y `MODEL_GATEWAY_API_KEY` a `packages/config` con el guardarraíl de entorno para tests (`test ↔ :4001`), y construir dentro de `packages/chatbot` el servidor HTTP **Mock Model Gateway** que suplanta al Gateway en el Entorno de Test publicando directamente el catálogo de capacidades que necesitan los tests E2E y de integración.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `packages/config` añade `MODEL_GATEWAY_URL` (`config.modelGatewayUrl()`) y `MODEL_GATEWAY_API_KEY` (`config.modelGatewayApiKey()`) como variables de entorno estándar. `.env.test` (versionado) fija `MODEL_GATEWAY_URL=http://127.0.0.1:4001` y `MODEL_GATEWAY_API_KEY=test-gateway-key`.
- [ ] `packages/config/src/guardrails.ts` valida que cuando `NEXT_PUBLIC_ENV === "test"`, `MODEL_GATEWAY_URL` apunte obligatoriamente al puerto `4001` (fallando fast si un test intenta apuntar al puerto `4000` de dev/prod).
- [ ] Se implementa el servidor HTTP **Mock Model Gateway** en `packages/chatbot/tests/mocks/gateway/` que escucha en `:4001` y expone:
  - `GET /v1/models/catalog`: devuelve directamente el catálogo de test definido por capacidades (`basicChat`, `basicChatAlt`, `canExecuteTools`, `canSeeImages`, `canProduceReasoning`, `alwaysRefuses`, `failsMidStream`) con sus propiedades (`temperature`, `supportedFiles`, `reasoning`, `zeroDataRetention`, `isDefault`), sin mapas de indirección a modelos comerciales.
  - `POST /v1/chat/completions`: responde en streaming SSE OpenAI o JSON determinista según el modelo invocado (incluyendo los contratos `fast-default`, `flash-default`, `vision-default`, `reasoning-default`, `free-default`, `image-default`).
  - `POST /v1/embeddings`, `POST /v1/rerank`, `POST /v1/decisions` (`/v1/systemone`) y `POST /v1/audio/speech`: responden de forma determinista para `embedding-default`, `rerank-default`, `decision-default` y `tts-default`.
- [ ] `packages/chatbot/playwright.config.ts` / `global-setup.ts` asegura que el Mock Model Gateway en `:4001` esté levantado durante las ejecuciones de `pnpm test:e2e`, y `pnpm stop:test` libera también `:4001` si quedara vivo.
- [ ] Tests unitarios/integración del Mock Model Gateway en verde verificando cada ruta y capacidad.

## Comments
