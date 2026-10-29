# 04: Migrar Chat Mode y conversación

**What to build:** Proteger el routing de Chat Mode y las reglas de
conversación mediante tests sociales de capacidades, conservando las
garantías distintas del protocolo y de los fallos.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [x] Se inventarían y trasladan los tests de routing y reglas de conversación a la organización objetivo, con colaboradores propios reales y sustitución del Model Gateway en su frontera HTTP.
- [x] Se comparan las garantías de pruebas de política y de integración antes de consolidarlas; se preservan los fallos de transporte y respuestas inválidas cuando cubran riesgos distintos.
- [x] Las pruebas aisladas o más estrechas se justifican por una regla significativa, contrato propio o coste y fragilidad desproporcionados de la frontera más amplia.
- [x] Se conserva cobertura funcional equivalente antes de retirar tests activos y se consulta al operador ante pérdida potencial de garantías o comportamiento no aclarado.
- [x] Se registran las decisiones y equivalencias en los comentarios del ticket y se ejecutan los tests y comprobaciones afectadas.

## Evidencia de migración (Chat Mode y conversación)

Inventario: las suites de routing y conversación ya usaban el seam HTTP del
Model Gateway (`inferenceKit.decide`/`createChatModeAgent` sobre MSW, PGlite para
persistencia). La migración de este ticket traslada las dos suites fuera de
`integration/` y la suite de render fuera de `component/` hacia
`tests/unit/chat/mode-routing/`, según ADR 0013 (unit por feature; render sin
navegador es unit). Sin cambios de asserts ni de implementación; no se retiró
ningún test activo. Los imports relativos a `tests/helpers` pasan a `@/tests/helpers`.

Traslados (`git mv`, mismo contenido salvo imports):
- `tests/integration/chat/mode-routing.test.ts` → `tests/unit/chat/mode-routing/persistence-and-routing.test.ts`
- `tests/integration/chat/neutral-branch.test.ts` → `tests/unit/chat/mode-routing/neutral-branch.test.ts`
- `tests/component/chat/mode-routing.test.tsx` → `tests/unit/chat/mode-routing/chat-mode-ui.test.tsx`

Referencias actualizadas: `tests/contract/chat/post-route-resume-persistence.test.ts`
(comentario), `lib/features/compaction/README.md`, `docs/model-gateway-testing-migration.md`.

### Garantías y destino

| Garantía | Destino | Evidencia |
|---|---|---|
| Auto persiste `chatMode = auto` y `chatModeRouting` en el mensaje del asistente | unit (social, PGlite + MSW) | `persistence-and-routing.test.ts` › persists Chat.chatMode = auto… |
| Modos explícitos no se enrutan y conservan el modo | unit (social) | `persistence-and-routing.test.ts` › does not route explicit chat modes… |
| Chats de proyecto no se enrutan aunque sean auto | unit (social) | `persistence-and-routing.test.ts` › does not route project chats… |
| Fallo de Decisions en persistencia → fallback neutro y se persiste | unit (social) | `persistence-and-routing.test.ts` › degrades to the neutral fallback… |
| `neither` → turno sin herramientas | unit (social, turno completo) | `neutral-branch.test.ts` › answers a `neither` decision with no tools… |
| Fallo de transporte y respuesta inválida → fallback neutro (riesgos distintos, se conservan ambos) | unit (social) | `neutral-branch.test.ts` › degrades… `'a Decisions transport error'` y `'an invalid Decisions answer'` |
| Timeout de Decisions → fallback neutro | unit (social, MSW con retardo) | `neutral-branch.test.ts` › degrades… when the Decisions call times out |
| Decisión de baja confianza aplicada sin compuerta | unit (social) | `neutral-branch.test.ts` › applies a low-confidence classifier decision as-is |
| Respuesta válida sin confianza se enruta | unit (social) | `neutral-branch.test.ts` › routes a valid answer without confidence… |
| Router HTTP: llamada real a Decisions, mapeo de modo, procedencia, errores | unit (social, MSW) | `create-chat-mode-router.test.ts` (ya en unit) |
| Política de fallback y timeout del resolutor | unit (social) | `resolve-chat-mode.test.ts` (ya en unit) |
| Mapeo puro de decisión ya resuelta (ctx7→context7, web, neutral) | unit aislado: regla significativa de política | `decide-resolved-mode.test.ts` |
| Selector de modo y badge de routing (render) | unit (jsdom, sin navegador) | `chat-mode-ui.test.tsx` (6 tests) |
| Composición del modo (herramientas, instrucciones, memoria, RAG forzado en proyecto) | unit (social, Gateway HTTP) | `chat-modes/mode-composition.test.ts` |
| Parámetros del agente y precedencia de overrides; bucle de herramientas | unit (social, Gateway HTTP) | `chat-modes/agent.test.ts` |
| Historial de herramientas envenenado se deduplica | unit aislado: regla pura | `conversation/poisoned-tool-history.test.ts` |
| Persistencia de ruta POST de conversación | contract (unit) | `tests/contract/chat/post-route-resume-persistence.test.ts` |

Justificación de E2E: ninguna garantía de Chat Mode requiere navegador real. No
existe E2E de routing en `tests/e2e` (grep sin resultados) y no se añadió ninguno.

Consolidación: no se fusionaron tests. El fallo de Decisions aparece en persistencia,
turno completo y resolutor, pero cada suite cubre un riesgo distinto (persistencia,
pipeline, política/HTTP), así que se conservan todos.

### Comandos ejecutados (Node 24, `PATH=/Users/javier.mota/.nvm/versions/node/v24.15.0/bin:$PATH`, en `packages/chatbot`)

- `pnpm exec vitest run tests/unit/chat tests/contract/chat tests/contract/test-profile-selection.test.ts` → 15 archivos, 138 tests, OK
- `pnpm exec vitest run tests/unit/chat/mode-routing/persistence-and-routing.test.ts tests/unit/chat/mode-routing/neutral-branch.test.ts tests/unit/chat/mode-routing/chat-mode-ui.test.tsx` → 3 archivos, 16 tests, OK
- `pnpm exec eslint tests/unit/chat/mode-routing tests/contract/chat/post-route-resume-persistence.test.ts` → sin errores
- `pnpm run type:check` → OK
- `pnpm exec vitest run` (perfil default completo, worktree) → 112 archivos pasan, 1 omitido (`tests/contract/client-bundle-no-secrets.test.ts`, requiere `.next/verify` de `build:verify`), 755 tests pasan, 1 omitido
- `pnpm exec eslint tests/unit/chat/mode-routing tests/contract/chat/post-route-resume-persistence.test.ts` → sin errores; `pnpm run type:check` → OK

Limitaciones: no se ejecutó `test:e2e` ni `build:verify`; el test omitido de bundle queda sin cobertura en este worktree. Los archivos `secrets.dev.ts` y `secrets.prod.ts` son placeholders gitignored, no secretos reales. No se tocó Production ni se creó PR.
