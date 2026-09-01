# 03 · Centralizar el conocimiento AG-UI en un module tipado

Status: needs-triage

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

## Comments

- 2026-09-01 · Revisión de arquitectura: candidato Worth exploring. Los cuatro
  dueños del conocimiento AG-UI verificados contra el código actual.
