# Subagent Extension — Diseño (C-1)

**Fecha:** 2026-08-02
**Estado:** Propuesta (pendiente de revisión)
**Contexto:** Investigación previa en conversación — "habilitar la invocación de subagents en el coding-agent". Se eligió la solución C-1 (extensión propia in-process) entre 4 alternativas.

## 1. Problema

Pi no incluye subagents por diseño (`docs/usage.md` del paquete: *"intentionally does not include built-in … sub-agents"*). El worker solo carga las tools nativas (`read`, `bash`, `edit`, `write`, …) más el paquete superpowers, y superpowers **no** provee un tool de subagents: sus skills (`dispatching-parallel-agents`, `subagent-driven-development`) asumen que el host lo provee. El bootstrap de `using-superpowers` lo contempla explícitamente: *"If no subagent tool is available, do the work in this session"*. Resultado: el agente hace todo inline y las skills de dispatch son inoperantes.

## 2. Decisiones tomadas (con el usuario)

| # | Decisión | Elección |
|---|----------|----------|
| D1 | Visibilidad en la vista principal | Tool call opaco (solo args + resultado); sin streaming anidado en la conversación principal |
| D2 | Vista dedicada de la sub-sesión | **En vivo**: la sub-sesión es una sesión Pi de primera clase servida por los endpoints snapshot/stream existentes; la vista streamea mientras corre |
| D3 | Composición de la vista dedicada | **Nueva ruta** que compone solo el componente de conversación, sin composer/textarea. Sin flag read-only |
| D4 | Definición de agentes | **v1: agente genérico** + parámetro `model` opcional. Parámetro `agent` reservado (error explícito). El formato de agentes especializados (`.pi/agents/*.md`) queda **pendiente de discusión** |
| D5 | Límite de concurrencia | **Sin límite en v1** (el paralelismo nativo de Pi basta; las skills despachan 2–4 típicamente) |
| D6 | Transporte del `subSessionId` al frontend | **Lookup RPC** `getSubagentSession(parentSessionId, toolCallId)` resuelto desde el `details` del tool result persistido por Pi. Cero cambios en el stream AG-UI, translator y cliente |

Hechos verificados que sustentan el diseño:

- `pi-agent-core` (`dist/agent-loop.js`) ejecuta los tool calls de un turno **en paralelo por defecto** (`executeToolCallsParallel`), salvo `toolExecution: "sequential"` o tools con `executionMode: "sequential"`. El patrón "varios dispatches en una respuesta = paralelo" de superpowers funciona nativamente.
- Pi persiste el campo `details` del tool result en el archivo de sesión → el mapeo `toolCallId → subSessionId` sobrevive recargas y reinicios del worker.
- AG-UI `TOOL_CALL_RESULT` no tiene campo `output`/`details` (schema `@ag-ui/core@0.0.57`) y el cliente `@ag-ui/client` descarta campos passthrough al materializar el `ToolMessage` — por eso D6 descarta el transporte vía evento.
- El diff de ficheros del turno padre (`captureTurnBaseline`/`diffTurnFiles`) se calcula al final del turno sobre el cwd compartido, así que **los edits de las sub-sesiones quedan capturados automáticamente** en el evento `coding_agent_files_changed` del padre.

## 3. Arquitectura

```
Sesión Pi padre (turno normal)
  └─ tool call: subagent({ task, description?, model? })
       └─ extensión subagent (packages/coding-agent/extensions/subagent/index.ts)
            └─ runSubagent()  (packages/coding-agent/src/session-manager.ts)
                 ├─ runtime hija vía makeCreateRuntime({ includeSubagentExtension: false })
                 │    • mismo proceso, mismo cwd del proyecto
                 │    • misma auth.json / models.json / skills (superpowers incluido)
                 │    • SIN la extensión subagent → anti-recursión estructural
                 ├─ SessionManager persistido en <CODING_AGENT_SESSIONS_DIR>/subagents/
                 ├─ registra la hija en el `sessions` Map  { parentSessionId, ... }
                 ├─ colector ligero (subagent-collector.ts):
                 │    eventos Pi hija → PiToAguiTranslator → SessionEventLog propio
                 └─ resultado: texto final de la hija
                    details: { subSessionId, subPiSessionId, parentSessionId }

Frontend (chatbot)
  tool-call-group.tsx  ──lookup RPC getSubagentSession(parentSessionId, toolCallId)──►  worker
       │◄── { subSessionId, subPiSessionId }
       └─ enlace "Ver sesión del subagente"
            → /agent/code/[project]/[sessionId]/subagent/[subSessionId]
                 (ruta NUEVA anidada bajo la ruta de sesión existente;
                  compone Sidebar + AgentConversation, SIN AgentCodeChatLayout/composer)
                 se alimenta de getSessionSnapshot / connectToSession con el subSessionId
```

### 3.1 Por qué la hija es una sesión Pi completa

Reutiliza sin modificar: `PiToAguiTranslator`, `SessionEventLog`, `getSessionSnapshot`, `connectToSession` (snapshot+cursor, prelude de reconexión, compaction de replay), persistencia en disco, recarga tras restart del worker, y el componente de conversación del frontend. Lo genuinamente nuevo es el colector ligero (§4.3), el lookup RPC (§4.5) y la ruta (§5).

## 4. Cambios en `packages/coding-agent`

### 4.1 Extensión `subagent` — `packages/coding-agent/extensions/subagent/index.ts` (nuevo)

Registra el tool vía `pi.registerTool()`:

```ts
subagent({
  task: string,         // requerido. Prompt autocontenido (las skills ya lo construyen)
  description?: string, // etiqueta corta para la UI
  model?: string,       // "provider/model-id"; default: modelo de la sesión padre
  agent?: string        // RESERVADO — ver §8
})
```

Responsabilidades: validar params, llamar a `runSubagent()` (import relativo a `../../src/`), propagar la señal de abort del `execute` a la sesión hija, y devolver `{ content, details }`. Es un shell fino: toda la lógica vive en el worker (testeable con los unit tests existentes).

La extensión se carga añadiendo su directorio a `resourceLoaderOptions.additionalExtensionPaths` en `makeCreateRuntime` ([`session-manager.ts`](../../../packages/coding-agent/src/session-manager.ts)) mediante una constante propia (p.ej. `FIRST_PARTY_EXTENSION_PATHS`). **No** forma parte de `PI_PACKAGES` ([`pi-packages.ts`](../../../packages/coding-agent/src/pi-packages.ts)), que está reservado a checkouts git pineados de terceros.

### 4.2 `runSubagent()` — en `src/session-manager.ts`

1. Resuelve el proyecto/cwd desde la sesión padre (mismo `resolveProjectPath`; la hija hereda el cwd — confinamiento idéntico al padre).
2. Crea `SessionManager.create(path.join(SESSIONS_DIR, "subagents"))` → `subPiSessionId`.
3. Crea la runtime hija con `makeCreateRuntime(modelId, { includeSubagentExtension: false })`:
   - `modelId` = param `model` si se pasa, si no el modelo actual de la sesión padre.
   - `model` inválido → tool result `isError` con el identificador recibido (el modelo puede corregir y reintentar).
   - `includeSubagentExtension: false` excluye el dir de la extensión de `additionalExtensionPaths` → la hija **no** tiene el tool `subagent` (profundidad máxima 1 garantizada por construcción).
4. Genera `subSessionId = crypto.randomUUID()` (id a nivel app, como las sesiones normales) y registra la entrada en el `sessions` Map con un campo nuevo `parentSessionId`.
5. Arranca el colector ligero (§4.3) y ejecuta `childSession.prompt(task)`.
6. Devuelve:
   - `content`: texto del último mensaje assistant de la hija. Si fue abortada, prefijo `[aborted] `. Si la hija terminó sin texto, nota explícita.
   - `details`: `{ subSessionId, subPiSessionId, parentSessionId, description? }`.
7. En `finally`: desregistrar el colector; la entrada **permanece** en el `sessions` Map (la vista dedicada la necesita viva para snapshot/stream).

Errores de la hija → tool result `isError: true` con el mensaje; la sub-sesión queda persistida e inspeccionable (valor de depuración).

### 4.3 Colector ligero — `src/subagent-collector.ts` (nuevo)

Versión recortada de `startPromptCollector`:

- Suscribe a los eventos de la hija, los pasa por un `PiToAguiTranslator` propio (`threadId: subSessionId`, `runId` propio) y los anexa a un `SessionEventLog` propio de la entrada hija.
- Sin `MESSAGES_SNAPSHOT` de arranque (no hay cliente que la necesite mid-run; el primer fetch usa `getSessionSnapshot`).
- Sin files-changed propio: el diff del turno padre ya captura los edits de la hija (mismo cwd, diff al final del turno).
- Eventos terminales (`RUN_FINISHED`/`RUN_ERROR`) anexados directamente.
- Mantiene `snapshotCursorSeq` de la entrada hija con la misma invariante que el colector principal (cursor tras el último mensaje finalizado).

### 4.4 Guard de acceso — sesiones hijas

`SessionEntry` gana `parentSessionId?: string`. En `getSessionSnapshot`, `getSessionMessages`, `getSessionStatus` y `connectToSession`:

- Si la entrada pedida tiene `parentSessionId`, el caller debe pasar `parentSessionId` en params y debe coincidir; si no → error (`"Subagent session requires parent session id"`).
- Las sesiones normales ignoran el parámetro.

Además, las hijas viven en `<SESSIONS_DIR>/subagents/`, así que `SessionManager.list(SESSIONS_DIR)` (usado para recargar sesiones normales tras restart) no las mezcla con chats de primer nivel.

`disposeSession(parentSessionId)` dispone también las entradas hijas registradas de ese padre (libera el `sessions` Map); los archivos en disco se conservan.

### 4.5 Lookup RPC — `getSubagentSession(parentSessionId, toolCallId)`

Nuevo método en [`transports/http.ts`](../../../packages/coding-agent/src/transports/http.ts) y en el `worker-client` del chatbot:

1. Obtiene (o recarga de disco) la sesión padre.
2. Camino en memoria: si la hija de ese `toolCallId` está registrada, devuelve `{ subSessionId, subPiSessionId }`.
3. Camino frío (tras restart del worker): lee los mensajes de la sesión padre (Pi los persiste con `details`), localiza el `toolResult` con ese `toolCallId`, extrae `details.subSessionId`/`subPiSessionId`, **rehidrata** la entrada hija (carga desde `<SESSIONS_DIR>/subagents/`, la registra con su `parentSessionId`) y la devuelve.
4. `toolCallId` desconocido o padre inexistente → error.

Esta RPC es a la vez el mecanismo de descubrimiento y el punto donde se reconstruye el linkage padre→hija tras un restart, manteniendo el guard de §4.4 coherente en todos los caminos.

### 4.6 Sin cambios (explícito)

- `pi-to-agui-translator.ts`: intacto (D6 — el `subSessionId` no viaja en el stream).
- `convertPiMessagesToAgui`: intacto.
- Protocolo AG-UI y `@ag-ui/client`: intactos.
- `PI_PACKAGES` / `scripts/install-packages.ts`: intactos.

## 5. Cambios en `packages/chatbot`

### 5.1 Tool call con enlace — `components/code/tool-call-group.tsx`

- Cuando el tool es `subagent`: renderiza `description` (o inicio de `task`) como args.
- Al montarse (o al completarse el tool call), llama a `getSubagentSession(parentSessionId, toolCallId)` vía `worker-client`.
- Si responde OK: enlace **"Ver sesión del subagente"** → la ruta de §5.2. Si el subagente aún corre, el enlace abre la vista en vivo (D2). Estados de carga/error discretos (sin enlace si falla el lookup).

### 5.2 Ruta dedicada — `app/(chat)/agent/code/[project]/[sessionId]/subagent/[subSessionId]/page.tsx` (nueva)

- La ruta `app/(chat)/agent/code/[project]/[sessionId]` **ya existe**; esto es un segmento anidado nuevo.
- Compone: `Sidebar` + el componente de conversación ([`agent-conversation.tsx`](../../../packages/chatbot/components/code/agent-conversation.tsx)) alimentado por el hook existente (`use-coding-agent`) apuntando al `subSessionId` (con `parentSessionId` en las llamadas RPC para el guard).
- **Sin** `AgentCodeChatLayout` → sin composer, sin picker de modelo, sin skills. No hay flag read-only: la ruta simplemente no compone los controles de entrada (D3).
- Sin índice ni listado: la única entrada es el enlace del tool call (D6 + guard §4.4).
- `CODING_AGENT_ENABLED !== "true"` → `notFound()`, como la ruta padre.

## 6. Cancelación y errores

| Caso | Comportamiento |
|------|----------------|
| Abort del turno padre | El `execute` recibe la señal → `childSession.abort()` → tool result parcial con prefijo `[aborted]`; la sub-sesión conserva todo lo producido hasta ese punto |
| `model` inválido | Tool `isError` con el identificador recibido; el modelo puede reintentar con otro valor |
| Fallo de la hija (excepción, error de provider) | Tool `isError` con el mensaje; sub-sesión persistida e inspeccionable |
| Uso del param `agent` | Tool `isError`: "parámetro reservado — formato de agentes pendiente de definición" |
| Worker restart mid-run | La hija muere con el proceso (in-process); el tool result queda como error/abortado. La parte ya persistida es visible vía lookup RPC (camino frío §4.5) |
| Recarga del navegador | El historial del padre muestra el tool call; el enlace se reconstruye vía lookup RPC; la vista dedicada carga snapshot + replay como cualquier sesión |

## 7. Testing

**Unit — worker (`packages/coding-agent`):**
- Extensión: validación de params (`task` requerido, `agent` → error reservado, `model` inválido → error).
- `runSubagent`: registro de la hija con `parentSessionId`; exclusión del tool `subagent` en la hija; abort propagation; resultado `isError` en fallo.
- Colector ligero: eventos Pi → eventLog propio; cursor `snapshotCursorSeq`; eventos terminales.
- Guard §4.4: snapshot/connect/messages rechazan hija sin `parentSessionId` correcto.
- Lookup RPC: camino en memoria, camino frío (rehidrata desde `details` persistidos), errores.
- Aislamiento: `SessionManager.list(SESSIONS_DIR)` no devuelve hijas.

**Unit — chatbot (`packages/chatbot`):**
- `tool-call-group`: render de args; enlace presente/ausente según respuesta del lookup; estados de carga/error.
- Ruta dedicada: composición sin composer.

**E2E manual:**
1. Despachar un subagente desde el chat (pedir explícitamente "usa la skill dispatching-parallel-agents" o invocar el tool).
2. Abrir el enlace en vivo → streaming en la ruta dedicada.
3. Recargar ambas vistas; reiniciar el worker; reabrir (camino frío).
4. Dispatch paralelo (2–3 subagentes en un turno) → enlaces independientes.
5. Cancelar el run padre → hija abortada, resultado parcial.

## 8. Fuera de scope (futuro)

- **Formato de agentes especializados** (`.pi/agents/*.md` con frontmatter: nombre, tools permitidas, modelo, prompt) — **pendiente de discusión**; el param `agent` queda reservado para ello.
- Límite de concurrencia / cola de subagentes (D5: se añadirá si se observa coste descontrolado).
- Progreso agregado del subagente en la vista principal (custom events de progreso).
- Evento files-changed propio por sub-sesión.
- Limpieza/TTL de sub-sesiones en disco.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Coste por dispatch descontrolado del modelo | Sin límite en v1 por decisión; monitorizar vía tracing (`TRACE_ENABLED`) y añadir tope si hace falta |
| Sub-sesiones acumuladas en el `sessions` Map (memoria) | Mismo ciclo de vida que las sesiones normales hoy; `disposeSession` del padre dispone también sus hijas registradas |
| Import de la extensión → `src/` (acoplamiento) | La extensión vive en el mismo paquete y se carga vía jiti con imports relativos; es código first-party compilado con el worker |
| Recursión | Estructural: la hija se crea sin la extensión (§4.2) |
| Mezcla de hijas en el listado de sesiones | Subdirectorio `subagents/` (§4.4) |
