# 03 · Centralizar el conocimiento AG-UI en un module tipado

Status: ready-for-human

> Siguiente paso: grilling loop con el usuario (skill `grilling`). La agenda
> está al final. Reporte con diagramas:
> http://192.168.18.50:3015/artifacts/ai-chatbot/architecture-review-20260901-083232-2c03c63d.html#c3
> Relación: hace al issue 02 más seguro (los helpers son lo que compaction y
> prelude consumen); comparte la identidad de mensajes con `SessionQueries`
> (issue 01).

## Evidencia

El translator define y a la vez borra el vocabulario:
`pi-to-agui-translator.ts:13` — `BaseEvent = { type: string; [key: string]:
unknown }`. A partir de ahí, cuatro modules re-derivan por su cuenta qué
significa cada evento, todos con casts:

1. **`session-manager.ts:111`** — `isTerminalAguiEvent`: terminal =
   `RUN_FINISHED` | `RUN_ERROR`.
2. **`replay-compaction.ts:48`** — `deltaRunKey`: concatenable =
   `TEXT_MESSAGE_CHUNK`/`REASONING_MESSAGE_CHUNK` (por `messageId`) o
   `TOOL_CALL_ARGS` (por `toolCallId`) si `delta` es string. Duplica lo que el
   translator ya sabía al emitir esos deltas.
3. **`reconnect-prelude.ts:13`** — la máquina abre/cierra: `TOOL_CALL_START`/
   `TOOL_CALL_END` por `toolCallId`, `STEP_STARTED`/`STEP_FINISHED` por
   `stepName`, un terminal lo cierra todo.
4. **`session-manager.ts:857`** — el `CUSTOM` `files_changed` se fabrica en
   `finalizeTurn`, fuera del translator: compaction y prelude lo ignoran hoy
   correctamente, pero por suerte, no por contrato.

El fallo es silencioso y de runtime: añadir un evento nuevo con delta y olvidar
`deltaRunKey` no da error de tipos — devuelve al reconnect el problema de miles
de micro-eventos que la compaction fue creada a resolver (ver cabecera de
`replay-compaction.ts`).

## Propuesta

Un module `AguiEvent` que posee:

```ts
// union discriminada: cada variante con sus campos tipados
type AguiEvent = TextMessageChunk | ReasoningChunk | ToolCallStart | ToolCallArgs
               | ToolCallEnd | RunFinished | … | FilesChangedCustom | UnknownAguiEvent;

// los cuatro conocimientos hoy dispersos, como helpers puros
isTerminal(e): boolean
deltaKey(e): string | null     // absorbe deltaRunKey
trackOpen(e, state): void      // absorbe la máquina de estados del prelude
isSyncPoint(e): boolean        // message_end / tool_execution_end → snapshotCursorSeq
```

- El translator **produce** la union (su salida deja de ser `BaseEvent`).
- session-manager, compaction y prelude **consumen** helpers, no casts.
- `files_changed` entra como variante `CUSTOM` tipada.
- `UnknownAguiEvent` como escape hatch: AG-UI es protocolo externo y la union
  no debe rechazar eventos futuros.

El test que hoy es imposible y después es trivial: **exhaustividad** — un
switch con never-check hace que añadir un evento sin clasificarlo sea error de
compilación.

## Por qué Worth exploring y no Strong

Blast radius real: tipar la union toca las 536 líneas del translator y todos
los casts downstream. Mejor ratio locality/esfuerzo después de los dos Strong.

## Agenda del grilling

- ¿Cuánto del translator se tipa? ¿Solo la salida de `translate()` o también el
  estado interno (`activeToolCalls`, `toolResultBuffer`, `hydrateState`)?
- ¿Cómo se modela `CUSTOM`? ¿Solo `files_changed` tipado o un genérico con
  `name` discriminado?
- ¿`UnknownAguiEvent` pasa por compaction/prelude con política "no tocar"?
- Migración: ¿big-bang del tipo de salida del translator o union gradual
  (translator emite union, consumidores migran uno a uno)?
- La identidad de mensajes (`message-ids.ts`, usada por translator y por
  `convertPiMessagesToAgui` en `session-manager.ts:1183`): ¿entra en este
  module o queda separada?
- Replace-don't-layer: los 977 líneas de `pi-to-agui-translator.test.ts`
  asertan sobre `BaseEvent` — ¿cuánto se reescribe?

## Decisiones (grilling 2026-09-02)

1. **Alcance**: la union tipa solo la salida de `translate()`; el estado
   interno del translator (`activeToolCalls`, `toolResultBuffer`,
   `hydrateState`) queda como está.
2. **`CUSTOM`**: variantes explícitas tipadas — `FilesChangedCustom`
   (`runId`, `files`; fabricado en el worker) y `CursorCustom` (`seq`,
   `epoch`, `terminal`; fabricado en el chatbot, ver decisión 13). Cualquier
   otro `CUSTOM` cae en `UnknownAguiEvent`.
3. **`UnknownAguiEvent`**: política "no tocar" en los cuatro helpers (no es
   delta, no abre/cierra, no es terminal, no es sync point). El translator
   nunca reenvía eventos desconocidos — la union de salida es cerrada — así
   que el never-check del switch del translator es lo que cubre el fallo de
   "delta nuevo sin clasificar".
4. **Migración**: big-bang completo. Union + translator + los 6 consumidores
   (`event-log`, `session-entry`, `replay-compaction`, `reconnect-prelude`,
   `turn-runner`, `subagent-collector`) en un solo cambio, verificado por
   tipos. Sin alias de compatibilidad: `BaseEvent` desaparece.
5. **`message-ids.ts`**: queda fichero separado; `agui-event` importa de él.
   La identidad compartida con `SessionQueries` (issue 01) se resuelve con
   imports, no con fusión.
6. **Tests**: migración mecánica de aserciones (los casts `as { delta? }`
   desaparecen porque las variantes tienen tipos reales) + test de
   exhaustividad con never-check del switch de consumidores.
7. **Forma de las variantes**: base común `AguiEventBase { timestamp: number }`
   extendida por cada variante; `rawEvent` en `STEP_*` tipado `unknown`
   explícito (no se elimina: cambiaría el wire format del replay).
8. **`MESSAGES_SNAPSHOT`**: variante `MessagesSnapshot` con
   `messages: unknown[]`. Tipar el mensaje AG-UI es territorio del issue 01
   (`convertPiMessagesToAgui`).
9. **Frontera del módulo**: posee el tracking (`trackOpen`) y el tipo del
   estado abierto (`OpenEventsState` con `openToolCalls`/`openSteps`);
   `reconnect-prelude` conserva la construcción de los eventos sintéticos.
   El módulo es vocabulario puro, sin saber para qué lo usa el replay.
10. **Ubicación**: `agui-event.ts` nuevo con la union, los cuatro helpers,
    el `AguiEventType` const (necesario en runtime) y un type-level check de
    que sus claves coinciden con los `type` de la union.
11. **Reorganización de `src/`**: incluida en este issue como commit previo
    aislado (ver plan de commits). Estructura por dominios:

    ```
    src/
    ├── agui/       # agui-event (nuevo), pi-to-agui-translator, event-log,
    │               # replay-compaction, reconnect-prelude, agui-messages,
    │               # message-ids
    ├── session/    # session-manager, session-registry, session-entry,
    │               # session-queries, turn-runner, turn-git-state
    ├── subagent/   # subagent-bridge, subagent-collector
    ├── artifacts/  # artifacts, artifacts-http
    ├── runtime/    # runtime-factory, models, pi-packages, paths, prompts,
    │               # attached-files, file-reference-prompt
    ├── transports/ # http.ts
    └── index.ts
    ```

12. **Superficie pública**: los 17 subpath exports de `package.json` se
    reescriben mecánicamente (`./agui/event-log`, …); no se colapsan a un
    barrel único. El chatbot actualiza 3 imports (`pi-to-agui-translator`,
    `attached-files`, `run-request-messages`) + 1 test contract.
13. **`CursorCustom` en el chatbot** (decisión post-review): el segundo
    CUSTOM conocido, `coding_agent_cursor`, se fabrica en el chatbot
    (`agui-stream-relay.ts:44-54`, con cast) y se consume en
    `use-coding-agent.ts:cursorFromEvent` (tres casts encadenados). El
    commit 2 migra también ambos ficheros a la union (`CursorCustom` +
    guard `isCursorCustom` exportados de `agui-event`), eliminando los
    casts. El stream del relay sigue tipado con `BaseEvent` de
    `@ag-ui/client`; solo la construcción y el narrowing del cursor pasan
    por la union.

### Plan de commits

1. `chore(coding-agent): reorganize src into domain folders` — `git mv` puro,
   cero cambios de código: imports relativos internos, tests unitarios
   (`../../src/...`), `package.json` exports, imports del chatbot. CI verde
   y verificable por sí solo.
2. `refactor(coding-agent): introduce typed AguiEvent union` — big-bang:
   `agui-event.ts` con union + helpers, translator produce la union,
   consumidores migran a helpers, `BaseEvent` eliminado, test de
   exhaustividad añadido. Incluye la migración chatbot del cursor
   (decisión 13): `agui-stream-relay.ts` y `use-coding-agent.ts` importan
   `CursorCustom`/`isCursorCustom` y pierden sus casts.

## Comments

- 2026-09-01 · Revisión de arquitectura: candidato Worth exploring. Los cuatro
  dueños del conocimiento AG-UI verificados contra el código actual.
- 2026-09-02 · Grilling completado, frontera vacía. Ver "Decisiones" arriba.
  Nota de drift: `isTerminalAguiEvent` vive hoy en `session-entry.ts:42` (no
  `session-manager.ts:111`); el `CUSTOM files_changed` se fabrica en
  `finalizeTurn` de `turn-runner.ts:292-308`; el sync point
  (`message_end`/`tool_execution_end` → `snapshotCursorSeq`) está en
  `turn-runner.ts:379-381`; `MESSAGES_SNAPSHOT` también lo construye
  `turn-runner.ts:369-375`, fuera del translator.
- 2026-09-02 · Code review: ¿hay otros CUSTOM? Verificado: en el worker solo
  `files_changed`; en el chatbot existe `coding_agent_cursor`
  (`agui-stream-relay.ts:44-54` → `use-coding-agent.ts:cursorFromEvent`,
  ambos con casts). Decisión: tiparlo también (opción B) — decisión 13 y
  commit 2 ampliados al chatbot.
- 2026-09-02 · Implementado: `agui-event.ts` con union discriminada, helpers isTerminal/deltaKey/trackOpen/isSyncPoint, variantes FilesChangedCustom/CursorCustom y Unknown escape hatch. Reorganización src en dominios (agui, session, subagent, artifacts, runtime) + migración big-bang de los 6 consumidores y chatbot cursor. Commit 7c1eb60 (verify:fast verde, 197 unit + 39 integration + 17 contract). Test de exhaustividad añadido en tests/unit/agui-event.test.ts. BaseEvent eliminado (alias temporal en pi-to-agui-translator para compat).
