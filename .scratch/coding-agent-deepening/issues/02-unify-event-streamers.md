# 02 · Unificar los dos streamers tras el seam de `SessionEventLog`

Status: ready-for-agent

> Grilling cerrado (sesión 2026-09-01): diseño bloqueado en **## Answer** abajo.
> Siguiente paso: implementar en una sesión nueva siguiendo **## Answer**.
> Reporte con diagramas:
> http://192.168.18.50:3015/artifacts/ai-chatbot/architecture-review-20260901-083232-2c03c63d.html#c2
> Relación: primera extracción natural del issue 01 (`TurnRunner`).

## Evidencia

`createLoggedEventStream` (l. 672, live) y `connectToSession` (l. 1425,
reconnect) duplican ~90 líneas de maquinaria en
`packages/coding-agent/src/session-manager.ts`:

| Pieza | Live | Reconnect |
|---|---|---|
| `shouldCloseOnTerminal` (guard `runId` vs `activeRun`) | l. 700-703 | l. 1488-1492 — **idéntica** |
| flags `closed`, `eventCounts`, contadores, `logSummary` | l. 683-698 | l. 1430-1453 |
| cierre `idle` si no hay run activo | l. 748 | l. 1541 |
| `readAfter` + `subscribe` | l. 738-742 | l. 1530-1553 |

El reconnect añade lo que el live no tiene: validación de `epoch`, prelude
sintético (`reconnect-prelude.ts` — reabre tool calls/steps que el cursor cortó
a medias) y compaction (`replay-compaction.ts` — concatena deltas consecutivos).

Fricción concreta:

1. **Política de cierre duplicada** — un fix en una copia no llega a la otra.
2. **El caller orquesta el replay**: `connectToSession` encadena
   `readUpTo` → prelude → `readAfter` → compact → emit, conocimiento repartido
   en tres archivos cuyo dueño natural es el `SessionEventLog`
   (`event-log.ts`, 56 líneas, el único module genuinamente deep del paquete).
3. **Dos políticas de `seq` sin contrato**: la compaction conserva el `seq` del
   último delta mergeado (el cursor avanza); el prelude reutiliza `afterSeq`
   (el cursor no avanza con eventos sintéticos). Hoy son dos comentarios en
   archivos distintos; nada impide compactar el prelude por error.

## Propuesta

```
SessionEventLog
  interface actual: append · readAfter · readUpTo · subscribe · epoch/lastSeq
  interface nueva:  + replayAfter(cursor) → { prelude: AguiEvent[], events: LoggedAguiEvent[] }
```

- `reconnect-prelude.ts` y `replay-compaction.ts` pasan a ser implementación
  privada del event log (dejan de importarse desde `session-manager`).
- Los dos streamers colapsan en uno: pide `replayAfter` o se suscribe,
  serializa líneas, aplica la política de cierre **una vez**.
- La política de `seq` se documenta en el contrato de `replayAfter`, no en
  comentarios.

## Tests al seam (hoy vs después)

Hoy "reconnect ve deltas compactados" exige cablear translator + event log +
compaction + `connectToSession` con sus tres callbacks. Después:

```ts
const { prelude, events } = log.replayAfter({ epoch, seq: 2 });
expect(events).toHaveLength(1);                       // 5 deltas → 1
expect(events[0].event.delta).toBe("hola mundo…");
expect(prelude.every(e => e.seq === cursor.seq))      // política de seq testeada
```

## Agenda del grilling

- ¿`replayAfter` devuelve el prelude con `seq` reutilizado o se modela el
  cursor como tipo (`Cursor { epoch, seq }`) con política explícita?
- ¿El streamer unificado sigue exponiendo `ReadableStream` (live) y callbacks
  (reconnect), o una sola forma? `transports/http.ts` consume ambas hoy.
- ¿Orden respecto al issue 01: este primero (acotado) o dentro de `TurnRunner`?
- ¿`buildReconnectPrelude` y `compactReplayEvents` sobreviven como funciones
  privadas o se funden en el cuerpo de `replayAfter`?
- ¿Qué pasa con `subagent-collector.ts`, que replica el wiring
  subscribe→translate→append del collector del Turn (sin snapshot ni diff)?
  ¿Un `RunCollector` parametrizado (`emitSnapshot`, `captureFileDiff`) entra en
  este issue o se descarta?
- Replace-don't-layer: ¿qué tests de `connectToSession`/compaction actuales se
  reescriben contra `replayAfter` y cuáles se borran?

## Answer

Diseño acordado en el grilling (2 rondas). Cada punto enlaza la pregunta de la
agenda que resuelve. `Propuesta` sigue siendo el mapa; aquí van solo los
**deltas** que el grilling fijó o cambió.

> Nota de estado: issue 01 ya aterrizó (commit `42b098e`) — los dos streamers
> viven hoy en `turn-runner.ts` y las líneas de la `Evidencia` están stale. La
> duplicación descrita persiste intacta.

### Orden y ámbito (Q3 de la agenda)
- **Standalone ya**, sin esperar al issue 03 (solo aportaría helpers de
  clasificación más seguros). El refactor vive en `turn-runner.ts` +
  `event-log.ts`.
- Contrato RPC estable (regla de 01): el nombre `connectToSession` se
  conserva; cambia solo la firma interna que consume `transports/http.ts`
  (único caller productivo).

### Contrato del seam (Q1)
- Cursor modelado como tipo: `Cursor { epoch, seq }` exportado desde
  `event-log.ts`, misma shape que `SessionCursor` (borde HTTP, emitido por
  `getSessionSnapshot`).
- `replayAfter(cursor: Cursor): { prelude: BaseEvent[]; events: LoggedAguiEvent[] }`
- El check de epoch **entra al seam** (throw on mismatch) — sale de
  `connectToSession`. Semántica de error preservada: hoy el mismatch llega al
  cliente como stream error (`handleRpc` devuelve 200, el error sale al leer
  el body), no como `-32603` limpio.
- Política de `seq` en el JSDoc del contrato, no en comentarios:
  - prelude estampado con `cursor.seq` → el cursor **no avanza** con eventos
    sintéticos (invariante del verifier AG-UI);
  - events compactados conservan el `seq` del último delta mergeado → el
    cursor **avanza**;
  - orden siempre `prelude → events`.

### Forma del streamer (Q2)
- Una sola forma: `ReadableStream<Uint8Array>` (NDJSON) para ambos caminos —
  live sin cursor (`readAfter lastSeq` + subscribe) y reconnect con cursor
  (`replayAfter` + subscribe).
- `transports/http.ts`: el handler `connectToSession` pierde el shim
  callback→stream y queda `new Response(stream)` igual que `sendPrompt`.
  `onComplete`/`onError` → `controller.close()`/`controller.error()`; cancel
  del cliente → cleanup, en un solo sitio.

### Funciones privadas vs fundidas (Q4)
- `buildReconnectPrelude` y `compactReplayEvents` **sobreviven como funciones
  puras** en sus archivos; se invierte la dirección del import: su único
  caller pasa a ser `event-log.ts` y `turn-runner.ts` deja de importarlas. No
  se funden en el cuerpo de `replayAfter` (evita un método-god de ~100
  líneas; conserva los seams de test puro).

### subagent-collector (Q5)
- **Fuera** de este issue; follow-up candidato a 03 (`RunCollector`
  parametrizado con `emitSnapshot?`/`captureFileDiff?`). Razones: es un
  *writer* que ya usa el seam (`eventLog.append`); la ausencia de
  snapshot/diff es intención documentada; `startPromptCollector` carga
  lógica propia del Turn. El subagent se beneficia gratis del streamer
  unificado (epoch propio + access guard ya funcionan).

### Testing (Q6, replace-don't-layer)
- **0 borrados.** Sobreviven intactos: `replay-compaction.test.ts` (10),
  `reconnect-prelude.test.ts` (5) — testean las funciones puras, no el seam —
  `http-transport-connect.test.ts` (validación de params se queda en http),
  `subagent-collector.test.ts` y los tests de registry/queries (usan
  `SessionEventLog` solo como seed).
- **Nuevo seam test** (`event-log` replay-after): 5 deltas → 1 evento;
  `prelude.every(e => e.seq === cursor.seq)`; orden prelude→events; epoch
  mismatch → throw. Reemplaza la no-existente versión cableada: nadie tenía
  ese escenario testado, así que no se reescribe ni se borra nada.
- **Nuevos 2 tests de `TurnRunner.connectToSession`** en `turn-runner.test.ts`
  (infra mock ya existente): access guard (`parentSessionId`), propagación
  del cursor, replay→subscribe→cierre idle, cancel del cliente. La política
  de cierre se testea una sola vez (streamer único).

## Comments

- 2026-09-01 · Grilling cerrado (2 rondas): diseño bloqueado en **## Answer**.
  Ronda 1: ámbito standalone, contrato con `Cursor` tipado + políticas de `seq`
  como contrato, streamer único `ReadableStream`, subagent-collector fuera.
  Ronda 2: funciones puras conservadas (import inverso), mapa de tests 0
  borrados + 2 niveles nuevos.
- 2026-09-01 · Revisión de arquitectura: candidato Strong. La duplicación y las
  políticas de `seq` verificadas contra el código actual.
