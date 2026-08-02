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
| D7 | Directorio de trabajo de la hija | **Param `cwd` opcional** (default: cwd del padre, simétrico a `model`). Validado: debe resolver a un directorio existente dentro del project root. Habilita un worktree por subagente en dispatch paralelo; la creación del worktree sigue siendo responsabilidad del orquestador (skill `using-git-worktrees` vía bash) |

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
                 │    • mismo proceso; cwd = param `cwd` (validado dentro del project root)
                 │      o el del padre por defecto — p.ej. un worktree por subagente
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
  cwd?: string,         // directorio de trabajo de la hija; default: cwd del padre.
                        // Debe resolver a un directorio existente dentro del project root
                        // (p.ej. un worktree <project>/.worktrees/<nombre>)
  agent?: string        // RESERVADO — ver §9
})
```

Responsabilidades: validar params, llamar a `runSubagent()` (import relativo a `../../src/`), propagar la señal de abort del `execute` a la sesión hija, y devolver `{ content, details }`. Es un shell fino: toda la lógica vive en el worker (testeable con los unit tests existentes).

**Descubrimiento de modelos (D4):** la `description` del tool se construye en el momento de registro e **incluye la lista de modelos disponibles** (`provider/model-id`, mismos valores que `getAvailableModels`), para que el orquestador pueda elegir `model` sin conocimiento externo. La resolución del string recibido es **estricta** (§4.2): match exacto o error con la lista.

La extensión se carga añadiendo su directorio a `resourceLoaderOptions.additionalExtensionPaths` en `makeCreateRuntime` ([`session-manager.ts`](../../../packages/coding-agent/src/session-manager.ts)) mediante una constante propia (p.ej. `FIRST_PARTY_EXTENSION_PATHS`). **No** forma parte de `PI_PACKAGES` ([`pi-packages.ts`](../../../packages/coding-agent/src/pi-packages.ts)), que está reservado a checkouts git pineados de terceros.

### 4.2 `runSubagent()` — en `src/session-manager.ts`

1. Resuelve el cwd de la hija: el param `cwd` si se pasa, si no el del padre (`resolveProjectPath(projectsRoot, entry.project)`). Si se pasa, se valida con el mismo criterio que `resolveProjectPath`: debe resolver a un directorio **existente dentro del project root** — un worktree creado como `<project>/.worktrees/<nombre>` es válido; cualquier path fuera del proyecto o inexistente → tool `isError` con el path recibido (el modelo puede corregir y reintentar).
2. Crea `SessionManager.create(path.join(SESSIONS_DIR, "subagents"))` → `subPiSessionId`.
3. Crea la runtime hija con `makeCreateRuntime(modelId, { includeSubagentExtension: false })`:
   - `modelId` = param `model` si se pasa, si no el modelo actual de la sesión padre.
   - Resolución del param `model`: match **estricto** contra los modelos disponibles (`provider/model-id`). Si no hay match → tool `isError` con la lista completa de modelos disponibles (el modelo ve la lista en la descripción del tool y de nuevo en el error; corrige y reintenta).
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
- Sin files-changed propio en v1. La cobertura heredada del diff del turno padre **solo aplica cuando la hija comparte cwd con el padre** (mismo repo): en ese caso los edits de la hija quedan capturados automáticamente. Con `cwd` en un worktree distinto (D7), el diff del padre **no** los captura — limitación documentada en §7/§10; la visibilidad de esos edits queda en la vista dedicada de la sub-sesión (que muestra los tool calls de edición de la hija). No se añade UI de files-changed por sub-sesión en v1.
- Eventos terminales (`RUN_FINISHED`/`RUN_ERROR`) anexados directamente.
- Mantiene `snapshotCursorSeq` de la entrada hija con la misma invariante que el colector principal (cursor tras el último mensaje finalizado).

### 4.4 Guard de acceso — sesiones hijas

`SessionEntry` gana `parentSessionId?: string`. En `getSessionSnapshot`, `getSessionMessages`, `getSessionStatus` y `connectToSession`:

- Si la entrada pedida tiene `parentSessionId`, el caller debe pasar `parentSessionId` en params y debe coincidir; si no → error (`"Subagent session requires parent session id"`).
- Las sesiones normales ignoran el parámetro.

Además, las hijas viven en `<SESSIONS_DIR>/subagents/`, así que `SessionManager.list(SESSIONS_DIR)` (usado para recargar sesiones normales tras restart) no las mezcla con chats de primer nivel.

En la UI tampoco pueden aparecer: el listado de sesiones de un proyecto sale de la tabla `codingAgentSessions` de la base de datos del chatbot (`listSessions({ userId, project })` en [`session-store.ts`](../../../packages/chatbot/lib/features/code/session-store.ts)), y las sub-sesiones nunca obtienen una fila ahí. El subdirectorio `subagents/` es defensa en profundidad sobre el listado de disco del worker, no el mecanismo que las oculta del sidebar.

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
- Compone:
  - `Sidebar` (igual que la ruta padre).
  - **`Header.Container`** (el Header vive hoy dentro de [`AgentCodeChatLayout`](../../../packages/chatbot/components/code/agent-code-chat-layout.tsx), así que la ruta lo compone por su cuenta): `Logo` + enlace "Volver a la sesión principal" (→ la ruta padre) en `Header.Left`, `ThemeToggle` en `Header.Right`. **Sin** los controles de una sesión interactiva: ni botón de nueva sesión, ni model picker, ni file browser.
  - `Main` + el componente de conversación ([`agent-conversation.tsx`](../../../packages/chatbot/components/code/agent-conversation.tsx)) alimentado por el hook existente (`use-coding-agent`) apuntando al `subSessionId` (con `parentSessionId` en las llamadas RPC para el guard). Si la conversación requiere contexto de `FileBrowserProvider` para sus enlaces de fichero, la ruta lo envuelve con `{ project, sessionId: subSessionId }` (a validar en implementación).
- **Sin** `AgentCodeChatLayout` → sin composer. No hay flag read-only: la ruta simplemente no compone los controles de entrada (D3).
- Sin índice ni listado: la única entrada es el enlace del tool call (D6 + guard §4.4).
- `CODING_AGENT_ENABLED !== "true"` → `notFound()`, como la ruta padre.

## 6. Cancelación y errores

| Caso | Comportamiento |
|------|----------------|
| Abort del turno padre | El `execute` recibe la señal → `childSession.abort()` → tool result parcial con prefijo `[aborted]`; la sub-sesión conserva todo lo producido hasta ese punto |
| `model` sin match exacto | Tool `isError` con la lista completa de modelos disponibles; el modelo puede corregir y reintentar |
| `cwd` fuera del project root o inexistente | Tool `isError` con el path recibido; el modelo puede corregir y reintentar |
| Fallo de la hija (excepción, error de provider) | Tool `isError` con el mensaje; sub-sesión persistida e inspeccionable |
| Uso del param `agent` | Tool `isError`: "parámetro reservado — formato de agentes pendiente de definición" |
| Worker restart mid-run | La hija muere con el proceso (in-process); el tool result queda como error/abortado. La parte ya persistida es visible vía lookup RPC (camino frío §4.5) |
| Recarga del navegador | El historial del padre muestra el tool call; el enlace se reconstruye vía lookup RPC; la vista dedicada carga snapshot + replay como cualquier sesión |

## 7. Worktrees y aislamiento de trabajo

Cómo encaja con las skills de superpowers:

- **SDD (secuencial):** el worktree lo crea el controlador una vez al inicio del plan (`using-git-worktrees`); los implementadores trabajan en ese mismo workspace. Funciona con el default del param `cwd` (heredar el del padre), sin cambios.
- **Dispatch paralelo de implementadores (`dispatching-parallel-agents`):** el patrón correcto es **un worktree por subagente** — si 3 implementadores editan el mismo checkout en paralelo se pisan. El flujo es: el orquestador crea los worktrees vía bash (`git worktree add <project>/.worktrees/<nombre> ...`, o la skill) y despacha cada subagente con `cwd: ".worktrees/<nombre>"`. El aislamiento es **estructural** (la sesión hija nace rooteada ahí: `bash`, paths relativos, `git rev-parse --show-toplevel`, scripts como `sdd-workspace`, tests y package managers resuelven todos contra el worktree) en lugar de depender de que el modelo respete paths absolutos en el brief.
- **La creación del worktree NO es responsabilidad del tool.** El tool solo rootea la hija; crear/limpiar worktrees es orquestación del agente principal (como hoy).
- **Restricción documentada:** el `cwd` debe estar dentro del project root. Worktrees externos (p.ej. directorios hermanos) se rechazan; la convención soportada es worktrees como subdirectorio del proyecto.

**Limitación conocida — files-changed con worktrees:** `captureGitFileState` calcula el diff del turno con `git status` sobre la raíz del proyecto. Los edits hechos en un *linked worktree* no aparecen en ese `git status` (a lo sumo el directorio del worktree como untracked). Por tanto, en flujos con worktree el evento `coding_agent_files_changed` del turno padre **no** reflejará los ficheros tocados dentro del worktree — ni los del subagente ni los del propio agente principal. Se documenta en §10; la resolución pasa por files-changed por sub-sesión calculado sobre el `cwd` de cada hija (§9), para lo que el param `cwd` de D7 es el habilitador.

## 8. Testing

**Unit — worker (`packages/coding-agent`):**
- Extensión: validación de params (`task` requerido, `agent` → error reservado, `model` inválido → error).
- `runSubagent`: registro de la hija con `parentSessionId`; exclusión del tool `subagent` en la hija; abort propagation; resultado `isError` en fallo; validación de `cwd` (dentro del project root / fuera / inexistente) y herencia del cwd del padre por defecto; resolución de `model` (match estricto, sin match → error con lista) y herencia del modelo del padre por defecto.
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
4. Dispatch paralelo (2–3 subagentes en un turno, cada uno con su `cwd` de worktree) → enlaces independientes y aislamiento real de edits.
5. Cancelar el run padre → hija abortada, resultado parcial.

## 9. Fuera de scope (futuro)

- **Formato de agentes especializados** (`.pi/agents/*.md` con frontmatter: nombre, tools permitidas, modelo, prompt) — **pendiente de discusión**; el param `agent` queda reservado para ello.
- Límite de concurrencia / cola de subagentes (D5: se añadirá si se observa coste descontrolado).
- Progreso agregado del subagente en la vista principal (custom events de progreso).
- Evento files-changed propio por sub-sesión, calculado sobre el `cwd` de la hija (D7 lo habilita; ver §7).
- Limpieza/TTL de sub-sesiones en disco.

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Coste por dispatch descontrolado del modelo | Sin límite en v1 por decisión; monitorizar vía tracing (`TRACE_ENABLED`) y añadir tope si hace falta |
| Sub-sesiones acumuladas en el `sessions` Map (memoria) | Mismo ciclo de vida que las sesiones normales hoy; `disposeSession` del padre dispone también sus hijas registradas |
| Import de la extensión → `src/` (acoplamiento) | La extensión vive en el mismo paquete y se carga vía jiti con imports relativos; es código first-party compilado con el worker |
| Recursión | Estructural: la hija se crea sin la extensión (§4.2) |
| Mezcla de hijas en el listado de sesiones | Sin fila en `codingAgentSessions` + subdirectorio `subagents/` (§4.4) |
| Files-changed ciego a edits en linked worktrees | Limitación documentada (§7); resolución futura vía files-changed por sub-sesión sobre el `cwd` de la hija (§9) |
| `cwd` como vector de escape del proyecto | Validación estructural: debe resolver dentro del project root (§4.2) |
| Timeout del modelo principal mientras el tool `subagent` sigue vivo | No aplica estructuralmente: durante la ejecución del tool no hay conexión abierta con el provider (turno API → ejecución local → siguiente turno API). Verificado: `pi-agent-core` no tiene timeout de ejecución de tools. Riesgo real = duración wall-clock, mitigado con abort propagado (§6) y paralelismo nativo |
