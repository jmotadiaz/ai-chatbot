# 05: Operación `decide` genérica y Chat Mode Router sobre ella

**What to build:** el kit expone una operación `decide` sobre la Decisions API de OpenRouter, reutilizable para cualquier pregunta de tipo `choice`, con timeout acotado, scope de trazas y provenance completa (choice, confidence, probabilities, modelId, provider, latencia, coste). El Chat Mode Router deja de poseer cliente, key y modelo: conserva su pregunta y su política y compone `decide`. Un turno en Chat Mode `auto` se enruta exactamente igual que hoy y persiste la misma metadata `chatModeRouting`.

**Blocked by:** 02 (kit con clientes e instancia raíz).

**Status:** ready-for-agent

- [ ] `models` incorpora `DECISION_MODELS` con Jev bajo un endpoint kind propio de decisión (`openrouterDecisions`) y el rol `chatModeRouter` en `MODEL_ROLES`; fuera de `INVOCABLE_MODEL_IDS` y de `generateModelsJson`.
- [ ] El kit posee el cliente de la Decisions API compartiendo key vía `config` con el provider de OpenRouter del AI SDK, construido perezosamente, y expone `decide({ model, question: { instructions, criteria }, state, scope? })` que devuelve `{ choice, confidence?, probabilities?, modelId, provider?, latencyMs, costUsd? }`. El timeout acota cada intento del SDK y la llamada completa; `sessionId`/`traceId` salen del scope de trazas actual cuando no se pasan. Los errores se propagan (la política de fallback es del consumidor).
- [ ] El tipo de provenance de decisión vive en el kit; `RoutingDecision` del Chat Mode Router se redefine como esa provenance más el resultado de dominio (`mode`, `reason`), y `probabilities` deja de estar tipado por las opciones de la pregunta dentro del tipo genérico. El ciclo tipos ↔ preguntas de la feature desaparece.
- [ ] El adaptador real del Chat Mode Router se sustituye por una composición fina `createChatModeRouter(decide)` que mapea `choice` → Resolved Chat Mode y copia la provenance; `questions`, `policy`, `resolveChatMode` y el router determinista de test no cambian de comportamiento. El módulo de composición del chat inyecta el router construido sobre la instancia raíz del kit.
- [ ] El contract test actual de mode-routing con fixture de la Decisions API se mueve al paquete como contrato de `decide` (request emitido, parseo de respuesta, error ante respuesta no `choice`). La feature conserva un unit test de mapeo `choice` → modo y reason con `decide` fake.
- [ ] Integration del chatbot: conversación en `auto` con `decide` fake inyectado por el kit de test produce la misma metadata `chatModeRouting` que hoy (mismos campos, `requested: "auto"`), y un fallo de `decide` degrada a la rama neutral con `reason: "fallback"`.
- [ ] La dependencia `@openrouter/sdk` se mueve del chatbot al paquete.
- [ ] `pnpm verify:fast` y `pnpm test:e2e` en verde; el eval de mode-routing sigue ejecutable sin cambios de dataset.

## Comments
