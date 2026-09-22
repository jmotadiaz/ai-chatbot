# 03: Rama neutra sin tools y política de fallback

**What to build:** el branch `neutral` de `createChatModeAgent` (ToolLoopAgent sin tools, `DEFAULT_PROJECT_AGENT_PROMPT`, misma `ModelConfiguration` del usuario) y la política pura que convierte la respuesta del router en modo final: `ctx7`/`web` → su modo, `neither` → neutral, confianza < 0.7 → neutral, error/timeout/respuesta inválida → neutral. Todavía sin OpenRouter: se ejercita con el port fake.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] Un mensaje clasificado `neither` responde sin ninguna tool call (test de conversación: ni `tool-*` parts ni tool calls ejecutadas).
- [ ] La política es una función pura unit-testeada: tabla con `ctx7` / `web` / `neither` / `low_confidence` / `fallback` y el `reason` correspondiente en `chatModeRouting`.
- [ ] El umbral de confianza vive en una constante única (`constants.ts`) y se usa también en el gate.
- [ ] Error o timeout del port no rompe el chat: metadata con `reason: "fallback"` y respuesta neutra.
- [ ] La rama neutra usa el mismo modelo y parámetros que el usuario eligió.
- [ ] Suites rápidas del repo en verde (lint, type-check, tests afectados).

## Comments
