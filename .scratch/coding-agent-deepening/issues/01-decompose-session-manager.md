# 01 · Descomponer el god module `session-manager.ts`

Status: ready-for-agent

> Grilling cerrado (sesión 2026-09-01): diseño bloqueado en **## Answer** abajo.
> Siguiente paso: implementar en una sesión nueva siguiendo el orden de **##
> Answer → Orden de extracción**. Reporte con diagramas:
> http://192.168.18.50:3015/artifacts/ai-chatbot/architecture-review-20260901-083232-2c03c63d.html#c1

## Evidencia

`packages/coding-agent/src/session-manager.ts`: 1816 líneas, 26 exports, 45 de
los últimos 150 commits. Siete responsabilidades coexisten sin seams internos:

| Líneas | Sección |
|---|---|
| ~93 | `sessions = new Map()` — estado global privado, solo alcanzable vía `__seedSessionForTests`/`__resetSessionsForTests` (l. 205-212) |
| 119 | `assertSessionAccess` — guard de Subagent por `parentSessionId` |
| 304-490 | `makeCreateRuntime` — fábrica de runtime Pi (auth, model registry, extensiones, skills, instrumentación) |
| 492-553 | `loadSessionFromDisk` — reload con rehidratación de Subagents |
| 555-671 | `getOrCreateSession` / `resolveSessionEntry` — reuse / reload / create + guard de model-switch mid-run |
| 672-999 | `createLoggedEventStream` + `startPromptCollector` — el core del Turn |
| 1078-1290 | queries: `getSessionMessages`, `convertPiMessagesToAgui`, skills/prompts |
| 1342-1564 | `disposeSession`, status/snapshot, `connectToSession` (reconnect) |
| 1566-1816 | `runSubagent` + validadores + `cancelRun` |

Cada export tiene exactamente 1 caller productivo (`transports/http.ts`): la
interface del archivo es casi tan ancha como su implementación.

## Propuesta

Extraer tres modules profundos; `session-manager.ts` queda como facade delgada
que conserva los nombres RPC (contrato estable con `transports/http.ts`):

### `SessionRegistry` — ¿dónde está esta sesión y quién puede tocarla?

- Absorbe: el `Map`, `resolveSessionEntry` (reuse/reload/create),
  `loadSessionFromDisk`, `disposeSession` (con reaping de Subagents),
  `assertSessionAccess`.
- Interface borrador: `get(id, access?)` · `getOrCreate(options)` · `load(id)` · `dispose(id)`.
- Detrás del seam: inicialización del `SessionEventLog`/`epoch`, rehidratación
  fría desde `subagents/`, `makeCreateRuntime` inyectado como factory (internal
  seam).
- Tests al seam: "Subagent sin `parentSessionId` falla cerrado", "dispose reapa
  hijos", "reload tras reinicio" — sin el hack `__seed`.

### `TurnRunner` — del prompt al `RUN_FINISHED`

- Absorbe: `startPromptCollector` (guard already-running, expansión de skills,
  inlining de adjuntos, `PiToAguiTranslator`, diff git files-changed antes del
  terminal, `snapshotCursorSeq`, trace sink), `sendPrompt`, `cancelRun`, y los
  dos streamers (`createLoggedEventStream`, `connectToSession`) — ver issue 02.
- Interface borrador: `run(turn) → stream` · `connect(id, cursor) → stream` · `cancel(id)`.
- Detrás del seam: las invariantes hoy escritas en comentarios ("thinking level
  viaja con cada prompt", "id estampado en `message_end`", "files-changed antes
  del terminal").
- Tests al seam: runtime Pi falso (emisor de eventos) → asertar stream AG-UI.

### `SessionQueries` — read models sobre una sesión

- Absorbe: `getSessionMessages` (+ `convertPiMessagesToAgui`),
  `getSessionSnapshot`, `getSessionStatus`, `getSessionSkills`,
  `getSessionPrompts`, `resolvePrompt`, `getSessionModel`,
  `getSessionThinkingLevel`, `getSubagentSessionForToolCall`.
- Deletion test: individualmente estos wrappers **fallan** (borrar
  `getSessionSkills` solo mueve una línea a `http.ts`); como grupo **pasan**,
  porque lo que reaparecería en N handlers RPC es el conocimiento compartido:
  resolver el entry, rehidratar en frío, convertir mensajes Pi, aplicar el
  access guard.
- Consumidor del issue 03: `convertPiMessagesToAgui` y el translator en vivo
  compartirían el module `AguiEvent` para la identidad de mensajes.

`runSubagent` queda en la facade componiendo los tres (valida, crea vía
`SessionRegistry`, corre vía `TurnRunner`).

## Agenda del grilling

- ¿Qué queda exactamente en la facade? ¿Los 15 nombres RPC o menos?
- ¿`SessionEntry` se expone tal cual o se encapsula? (Hoy `activeRun`,
  `snapshotCursorSeq`, `eventLog` son campos públicos que mutan varias
  secciones.)
- ¿Cómo se inyecta `makeCreateRuntime` en `SessionRegistry` sin arrastrar el
  grafo de imports al `subagent-bridge` (jiti)?
- Orden de extracción propuesto: TurnRunner → SessionRegistry → SessionQueries.
  ¿Se respeta o se empieza por otro?
- Testing: replace-don't-layer — ¿qué tests actuales mueren
  (`__seed`-dependientes) y cuáles sobreviven?
- ¿`getOrCreateSession` aplica thinking level o eso entra en `TurnRunner`?
  (Hoy el guard de model-switch mid-run vive en `resolveSessionEntry:596-603`.)

## Answer

Diseño acordado en el grilling (4 rondas). Cada punto enlaza la pregunta de la
agenda que resuelve. `Propuesta` sigue siendo el mapa de qué absorbe cada
module; aquí van solo los **deltas** que el grilling fijó o cambió.

### Facade (`session-manager.ts`)
- Conserva los **16 nombres RPC** que hoy importa `transports/http.ts` (contrato
  estable, **sin** cambios de nombre). Dejan de ser exports públicos:
  `applyThinkingLevel`, `resolveSubagentCwd/ModelId`, `ensureSubagentSessionsDir`
  (→ internos), `__seedSessionForTests`, `__resetSessionsForTests` (→ **muere**,
  ver Testing).
- Punto de composición: cada wrapper resuelve el handle con `registry.get(...)` y
  lo pasa al Turn/Queries; `connect(id, cursor)` → la facade resuelve el id antes.

### Modules base (nuevos, internos)
- **`session-entry.ts`** (Q2 encapsulado): posee el tipo `SessionEntry` (opaco a
  `http.ts`/tests) **y** centraliza la mutación — `ensureEventLog`,
  `appendAguiEvent`, `isTerminalAguiEvent`, fijar/limpiar `activeRun`, avanzar
  `snapshotCursorSeq`. Writer (Turn) y reader (Queries) acceden por esta única
  puerta. Nuevo campo `pendingModelSeed?` (ver Config de turno).
- **`runtime-factory.ts`** (Q3): `makeCreateRuntime` + `instrumentBootstrapInjection`.
  Lo importan por defecto Registry y facade. Riesgo jiti = **ninguno**: no toca
  `subagent-bridge.ts`, que sigue libre de imports del worker. `SessionRegistry`
  acepta un **override** de factory (default = el import) → ese es el seam de test
  que reemplaza `__seed`.
- **`convertPiMessagesToAgui`** queda en la capa interna, compartido por Turn y
  Queries (ni Turn→Queries ni Queries→Turn). Su casa definitiva es el module
  `AguiEvent` del **issue 03**; aquí solo se ubica.

### Config de turno (Q6→Q7→Q8: b1)
- Model + thinking level son **config de turno**: `TurnRunner.run()` aplica
  `setModel`/`setThinkingLevel` al arrancar (guard `isStreaming` íntegro aquí)
  **solo si difieren** de lo que ya tiene el runtime → el turno normal no paga un
  `setModel` redundante.
- **Cambio de contrato (b1)**: `sendPrompt` pasa a llevar `modelId`+`thinkingLevel`;
  `getOrCreateSession` deja de aplicar thinking y deja de correr el guard.
- **Q8 semilla**: `getOrCreateSession` conserva `modelId` **solo como semilla de
  create/reload** (Pi lo necesita para construir el runtime; el reload-from-disk
  hoy ya fuerza el modelo — ver `thinking-level-reload`). No se mueve al turno:
  con un `setModel` extra en cada arranque se degradaría el path de worker reiniciado.

### Ownership de lecturas (Q9)
- `getSessionModel` y `getSessionThinkingLevel` → **`SessionQueries`** (el *write*
  va al Turn, el *read* sigue siendo read-model sobre `entry.runtime.session.*`).

### Orden de extracción (Q4)
1. `session-entry.ts` + `runtime-factory.ts` — moves puros, **sin** cambio de
   comportamiento. Dejan el resto con seams donde caer.
2. `session-registry.ts`
3. `turn-runner.ts` ← aquí aterriza la config de turno (b1)
4. `session-queries.ts`
5. Facade reducida + muere `__seed`

### Testing (Q5=a + Q10, replace-don't-layer)
- **Borrar** los 9 archivos `__seed`-dependientes y **reconstruir cada escenario en
  su seam** (runtime-factory fake, no `__seed`):
  - attachments / files-changed / connect / reconnect → `TurnRunner`
  - skills / prompts → `SessionQueries`
  - subagent-guard / subagent-lookup → `SessionRegistry` + facade `runSubagent`
  - thinking-level (`__seed`) → **absorbido** por el test de `TurnRunner.run` (config de turno)
- `thinking-level-reload` (sin `__seed`) se **reescribe**: semilla en reload +
  aplicación en el turno.
- **Sobreviven intactos**: `available-models`, `pi-session-persistence`,
  `subagent` (creación real), `contract/http-transport-connect`.

### Blast radius b1 (consecuencia mecánica, mismo issue)
- `packages/chatbot/app/(chat)/api/agent/code/route.ts`: `modelId`/`thinkingLevel`
  dejan de ir en `initializeSession` y viajan en `sendPrompt`.
- `packages/chatbot/lib/features/code/worker-client.ts`: firmas de `sendPrompt` /
  `initializeSession` + `summarizeWorkerRpcParams`.
- `packages/coding-agent/src/transports/http.ts`: handler `sendPrompt` extrae
  model/thinking del body.
- `packages/chatbot/lib/features/code/actions.ts` (`startInitialRun`): mueve los
  params al `sendPrompt`.
- Revisar e2e de `tests/` que ejercite el modelo por turno.

## Comments

- 2026-09-01 · Revisión de arquitectura: candidato Strong. Creado con la
  evidencia de exploración (3 subagentes) y la discusión de los tres modules.
