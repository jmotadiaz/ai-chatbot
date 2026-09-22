# Spec: Chat Mode `auto` — enrutado web ↔ ctx7 con Jev (TypeSafe) vía OpenRouter

**Status:** ready-for-agent

## Problem Statement

Los Chat Modes del chatbot son excluyentes: antes de escribir, el usuario tiene que adivinar
si su pregunta necesita el Chat Mode **web** (búsqueda en internet) o **ctx7**
(documentación de librerías vía Context7). Es una apuesta: el prompt de ambos modos fuerza
al menos una tool call por turno (*"You MUST search at least once"* / *"ALWAYS call
resolveLibraryId first"*), así que elegir mal no es neutro — paga latencia, coste y ruido de
fuentes por una herramienta que no tocaba, o se queda sin la información actualizada que
necesitaba. Y hay una tercera categoría de mensajes (charla, preguntas repo-locales,
transformaciones de texto pegado) para la que ninguna de las dos herramientas aplica, pero
elegir cualquier modo le fuerza igualmente una tool call.

## Solution

Un Chat Mode nuevo **`auto`**, default de los chats nuevos, que clasifica cada turno con
**Jev 1.13** (System One de TypeSafe) a través de la **Decisions API de OpenRouter**
(`@openrouter/sdk`) y enruta la respuesta:

- necesita documentación de software actualizada (librería, framework, SDK, CLI, API de
  lenguaje) → Chat Mode **ctx7**
- necesita información externa **actual o verificable**: actualidad y noticias, datos que
  cambian (precios, releases, disponibilidad), referencias y fuentes para contrastar una
  afirmación, contenido de una URL, comparativas que dependen del mundo real → Chat Mode
  **web**
- `neither` (no se necesita herramienta), **confianza < 0.7**, **timeout** o **error del
  router** → **rama neutra** interna, sin tools, con `DEFAULT_PROJECT_AGENT_PROMPT`

La decisión viaja como provenance en la metadata del mensaje (`chatModeRouting`) y se muestra
en la UI junto al mensaje (`Chat Mode: Auto → Web · 0.98`). El router nunca puede romper un
chat: cualquier fallo degrada a la rama neutra.

## User Stories

1. As a chat user, I want new chats to start in Auto, so that I don't have to pick a mode
   before knowing what I will ask.
2. As a chat user, I want library and framework questions routed to the Context7 Chat Mode,
   so that answers use up-to-date documentation.
3. As a chat user, I want questions that need current or verifiable external information
   (news, prices, releases, references, URL content) routed to the Web Chat Mode, so that
   answers use the open internet.
4. As a chat user, I want general reasoning, repo-local questions and plain chat to be
   answered by a tool-less neutral branch, so that I never pay an irrelevant search or doc
   lookup.
5. As a chat user, I want pronoun-only follow-ups ("¿y eso cómo se hace?", "y la de Apple")
   routed with the previous turn as context, so that the referent of the message is resolved.
6. As a chat user, I want to see which branch the router chose for a message, and why, so
   that an unexpected search or doc lookup is explainable.
7. As a chat user, I want my explicit Chat Mode selection (ctx7, web, rag) to keep working
   unchanged, so that I can override Auto per chat.
8. As a chat user, I want the Auto choice to persist with the chat across reloads, so that a
   refresh does not silently change my mode.
9. As a chat user in a project chat, I want behavior unchanged, so that project RAG is not
   affected by the routing feature.
10. As a maintainer, I want the routing decision to be unit-testable without network, so that
    suites stay deterministic.
11. As a maintainer, I want the routing prompt and criteria to be versioned in code and
    measured by an eval, so that tuning the threshold and the criteria is data-driven.
12. As an operator, I want router failures to be silent for the chat and observable in message
    metadata, so that an OpenRouter outage degrades gracefully instead of erroring.
13. As an operator, I want the routing cost and latency accounted per turn, so that the
    feature can be priced against the tool calls it replaces.

## Implementation Decisions

- **Vocabulario.** Todo el código nuevo usa el lenguaje de dominio *Chat Mode*: `CHAT_MODES`,
  `ChatMode`, `ResolvedChatMode`, `ChatModeRouterPort`, `resolveChatMode`,
  `MessageMetadata.chatModeRouting`. En el mismo slice se limpia la superficie legacy que
  todavía llama "agent" al modo: tipo `Agent` → `ChatMode`, `AGENTS` → `CHAT_MODES`,
  `AgentSelector` → `ChatModeSelector` (labels `Auto / Ctx7 / Web / RAG`, sin sufijo "Agent"),
  directorio `lib/features/chat/agents/` → `lib/features/chat/chat-modes/`, `createAgent` →
  `createChatModeAgent`, campo `agent` del body de `/api/chat` → `chatMode`, y en DB el enum
  `agent` → `chat_mode` y la columna `Chat.agent` → `Chat.chatMode` (rename metadata-only;
  drizzle-kit puede pedir confirmación interactiva del rename al generar la migración).
  "Agent" queda reservado al Coding Agent en prosa, código y UI.
- **Tipo y DB.** `auto` se suma a `CHAT_MODES`; `ResolvedChatMode = "context7" | "web" |
  "neutral"` (la rama neutra **no** es un Chat Mode seleccionable y no entra al pgEnum). La
  migración de Drizzle añade `auto` al enum; `Chat.chatMode` guarda la elección del usuario
  (`auto`) y el modo resuelto vive en `Message.metadata.chatModeRouting`, que ya se persiste
  como JSON. Default de `Chat.chatMode` y de los fallbacks de UI/handler pasa de `"context7"`
  a `"auto"` (chats existentes conservan su valor).
- **Seam.** `lib/features/chat/mode-routing/`: `types.ts` (`ChatModeRouterPort`,
  `ChatModeRoutingMetadata`, `RoutingDecision`), `questions.ts` (la `choice` y sus criterios),
  `openrouter.ts` (adapter `@openrouter/sdk`), `index.ts` (`resolveChatMode()`: construye el
  `state`, aplica gate de confianza y política de fallback — función pura salvo el port).
- **Composición.** `makeProcessChatResponse(compactionAi, modeRouter)`; router real en
  `conversation/index.ts`, router fake determinista cuando `isTestMode()`. El despacho de
  `createChatModeAgent()` no cambia de lógica: sigue eligiendo por modo; la rama neutra es un
  `ToolLoopAgent` sin tools con `DEFAULT_PROJECT_AGENT_PROMPT` y la misma `ModelConfiguration`
  del usuario.
- **Momento y alcance del routing.** Solo cuando `chatMode === "auto"` y no hay `projectId`; una
  resolución por turno, inmediatamente antes de crear el agente, en `makeProcessChatResponse`.
  El stream espera la decisión (≈470 ms medidos).
- **Entrada del clasificador.** `state = { latest_message, recent_context }`, donde
  `recent_context` es el turno anterior (user + assistant) truncado a 500 caracteres por
  mensaje. `latest_message` es el texto del último mensaje de usuario; los adjuntos
  (`textFiles`) no se envían al router.
- **Pregunta.** Una sola `choice` con 3 opciones (`ctx7`, `web`, `neither`), instrucciones en
  inglés y rutas explícitas (`latest_message`), siguiendo el patrón de *intent routing* y
  *speculative fan-out* de TypeSafe (preguntas baratas y tipadas, la lógica en código).
- **Modelo y transporte.** `typesafe/jev-1.13` vía `POST https://openrouter.ai/api/alpha/decisions`
  (`openRouter.alpha.decisions.create`); `session_id = chatId` y `trace.trace_id = traceRunId`
  cuando el tracing está activo. Timeout 1500 ms; el SDK ya reintenta 5XX con backoff.
- **Política de fallback.** `neither` → neutro (`reason: "neither"`); `confidence < 0.7` →
  neutro (`"low_confidence"`); timeout, error 4xx/5xx o respuesta inválida → neutro
  (`"fallback"`). El router jamás lanza hacia el stream del chat.
- **Metadata y UI.** `MessageMetadata.chatModeRouting`: `{ requested: "auto", mode, reason,
  confidence?, probabilities?, modelId, provider?, latencyMs? }`, emitida en el `start` del
  mensaje y persistida con él. En el mensaje, un badge expandible reusa el patrón visual de
  "Router Details" (`Chat Mode: Auto → Web · 0.98`; las razones de fallback se muestran
  explícitas).
- **Selector.** Entrada "Auto" (primera y default) en `ChatModeSelector`, con icono propio;
  ctx7, rag y web siguen seleccionables.
- **Config y dependencias.** `OPENROUTER_API_KEY` ya existe en `.env.dev`,
  `.env.development.local` y `.env.prod`, y el provider del AI SDK la lee directo de
  `process.env`; **no** está en el catálogo de `packages/config` ni hay
  `config.openRouterApiKey()`. Se añade al catálogo y el adapter la consume vía `config`
  (regla del repo: nada de `process.env` en `src/`), lo que de paso da acceso tipado al
  provider existente. `@openrouter/sdk@^1.3.11` como dependencia del chatbot.

## Testing Decisions

- Un buen test asserta comportamiento externo: el modo con el que se responde, la provenance
  en metadata, el fallback ante error, y que un chat de proyecto no enruta. Ningún test mira
  el prompt ni el interior del SDK.
- **Unit:** tabla de `resolveChatMode()` (ctx7/web/neither/confianza baja/error/timeout),
  construcción del `state` (truncado a 500, historial vacío, mensajes sin texto).
- **Contract:** fixture de una respuesta real de la Decisions API parseada por el adapter
  (forma del request/response, sin red).
- **Integration:** conversación con `chatMode: "auto"` y port fake — persistencia de
  `Chat.chatMode = "auto"` y de `chatModeRouting`; migración del enum; chat de proyecto
  intacto.
- **Component:** el selector incluye Auto y lo pinta; el badge renderiza cada `reason`.
- **Eval (evalite):** caso `mode-routing` con dataset etiquetado (~25–40 mensajes ES/EN,
  incluyendo follow-ups pronominales y casos de "necesito fuentes/referencias que pueda
  verificar"), scorer de accuracy por clase y distribución de confianza. Se ejecuta al tocar
  criterios o umbral; coste del run completo ~$0.0005.
- Seams: el port del router (nivel más alto, ya diseñado para ser fakeado), la metadata del
  mensaje (contrato con la UI y con la DB) y el enum de la DB (migración). Prior art: los
  tests de conversación y mocks existentes (`tests/mocks/ai`), el harness de evalite y el
  patrón de provenance de `autoModel`.

## Out of Scope

- RAG como destino de enrutado (sigue siendo selección manual).
- Un cuarto Chat Mode seleccionable para la rama neutra: es interna y no aparece en el selector.
- Pre-filtros heurísticos (p. ej. fast-path por URL) antes del router.
- Memoria de routing entre turnos o stickiness por tema: la decisión es por turno.
- Enrutado en chats de proyecto (hoy el agente de proyecto ignora el Chat Mode).
- Adjuntos (`textFiles`) e imágenes como entrada del clasificador.
- Ajustar o afinar el modelo Jev; solo se tunean criterios y umbral vía eval.
- Configuración del router por usuario o por env: el modo `auto` es el interruptor.
