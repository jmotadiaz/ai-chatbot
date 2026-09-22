# 04: Router real con Jev 1.13 (OpenRouter Decisions)

**What to build:** el adapter real del port: `@openrouter/sdk` llamando a `alpha.decisions.create` con una `choice` de 3 opciones (`ctx7` / `web` / `neither`), `state { latest_message, recent_context }` con el turno anterior truncado a 500 chars, `session_id = chatId`, `trace.trace_id`, timeout 1500 ms; `OPENROUTER_API_KEY` al catálogo de `config`; composición real en `conversation/index.ts`; metadata con confianza, probabilidades, modelo, provider y latencia.

**Blocked by:** 03.

**Status:** ready-for-agent

- [ ] Pregunta, criterios y versión viven en `questions.ts` (inglés, rutas explícitas `latest_message`; criterio `web` = actualidad + información externa verificable/referencias/URL, según spec).
- [ ] Dependencia `@openrouter/sdk@^1.3.11` en `packages/chatbot`; el adapter no usa `process.env`: consume `config.openRouterApiKey()`.
- [ ] `OPENROUTER_API_KEY` añadida a `packages/config/src/catalog.ts` (secret, opcional) con accessor tipado; el provider existente del AI SDK puede pasar a consumirla también.
- [ ] `state` construido con el último mensaje de usuario y el turno anterior (user + assistant) truncado a 500 chars por mensaje; adjuntos (`textFiles`) excluidos.
- [ ] Timeout 1.5 s, gate de confianza 0.7 y errores 4xx/5xx → neutral (`reason: "fallback"`), sin lanzar nunca hacia el stream del chat.
- [ ] `chatModeRouting` incluye `confidence`, `probabilities`, `modelId`, `provider` y `latencyMs`.
- [ ] Contract test con fixture de una respuesta real de la Decisions API (sin red) e integration con el fake inyectado en `isTestMode()`: ninguna suite toca la red.
- [ ] Suites rápidas del repo en verde (lint, type-check, tests afectados).

## Comments
