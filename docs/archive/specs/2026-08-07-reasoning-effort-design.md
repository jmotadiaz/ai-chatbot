# Diseño — Reasoning effort configurable en el coding agent

**Fecha:** 2026-08-07
**Estado:** propuesta (sin commit)

## Resumen

El coding agent no permite controlar el esfuerzo de razonamiento (reasoning effort). Este diseño añade:

1. **Default por modelo** — el catálogo (`packages/models`) declara un `defaultThinkingLevel` por modelo; es lo que la UI muestra por defecto y el fallback del route del run cuando el cliente no manda nivel.
2. **Control perezoso desde la UI** — un chat control con icono de settings dentro del textarea del coding agent (junto a los controles de attachments/skills) despliega un dropdown para elegir el nivel de razonamiento del próximo turno. Como el modelo, el nivel vive en el cliente y viaja con el prompt.

Pi ya soporta thinking levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`) con clamp automático por modelo vía `thinkingLevelMap`; el trabajo es exponer ese mecanismo a través del catálogo, el worker y la UI.

## Contexto

- Pi expone `session.setThinkingLevel(level)` (clampea al modelo), `session.thinkingLevel` y `session.getAvailableThinkingLevels()`. El default de Pi es `medium` (`DEFAULT_THINKING_LEVEL`), o lo que quede persistido en `settings.json` del worker.
- Los built-ins de Pi para `opencode-go` (el provider del repo) ya definen `thinkingLevelMap` por modelo. Ej. `deepseek-v4-pro`: solo `off`/`high`/`xhigh` (donde `xhigh` se envía como `max`). Modelos sin `thinkingLevelMap` soportan `off`…`high` (`xhigh` requiere mapping explícito).
- El worker (`packages/coding-agent`) crea sesiones con `getOrCreateSession` (`makeCreateRuntime(modelId)` → `createAgentSessionFromServices`). El modelo viaja del chatbot al worker como `providerId/modelId` (`opencode-go/<id>`) en el RPC `initializeSession`.
- El chatbot conoce el catálogo vía el paquete `models` (mismo flujo que `toPiModelId` en el route `POST /api/agent/code`).

## Decisiones (acordadas con el usuario)

| # | Pregunta | Decisión |
| --- | --- | --- |
| 1 | Cómo configurar el default máximo por modelo | Campo declarativo `defaultThinkingLevel` en el catálogo por modelo (opción B) |
| 2 | Al cambiar de modelo en una sesión existente | Aplicar el `defaultThinkingLevel` del nuevo modelo (opción A) |
| 3 | Alcance del control de la UI | Por sesión (opción A) — igual que el modelo; Pi lo persiste en la sesión |
| 4 | Cuándo se aplica el cambio de modelo del picker | **Lazy**: el modelo viaja con el prompt (cambiar el picker mid-run era problemático: `setModel` sobre una sesión streaming). El guard del worker que rechaza `setModel` en sesiones streaming se mantiene como defensa. |
| 5 | Cuándo se aplica el nivel de razonamiento | **Lazy también**, por coherencia con el modelo y porque es la única forma de configurarlo en una sesión nueva: el nivel vive en el cliente y viaja con el prompt. Solo importa cuando corre un turno, así que aplicarlo antes no aporta nada. |

> Nota post-implementación: el `thinkingLevelMap` de los built-ins de Pi NO se hereda en runtime (Pi reemplaza el built-in entero con la entrada de `models.json`), así que `generateModelsJson` lo emite explícitamente desde el baseline (commit `7f9207e`).
>
> Se probaron y descartaron dos variantes: **B2** (aplicar el modelo al vuelo desde el picker) por el `setModel` mid-run, y **B1** (nivel por sesión con POST inmediato + dropdown informativo con los niveles del modelo seleccionado). B1 fallaba en lo esencial: en una sesión nueva el worker aún no tiene sesión, el GET devolvía `thinking: null` y el control quedaba deshabilitado hasta después del primer mensaje. Además el dropdown ofrecía los niveles del modelo del picker mientras el POST escribía sobre la sesión, que seguía con el modelo anterior (nivel clampado a otra cosa), y el default del modelo nuevo pisaba la elección manual al enviar.

## Diseño

### 1. Catálogo — `packages/models`

**`packages/models/src/catalog.ts`:**

- Nuevo tipo exportado:
  ```ts
  export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  ```
- Nuevo campo opcional en `ModelCatalogEntry`:
  ```ts
  defaultThinkingLevel?: ThinkingLevel;
  ```
- Valores para los modelos `userInvocable` (máximo soportado según el built-in de Pi; `xhigh` solo cuando el built-in lo declara):

  | Modelo | `defaultThinkingLevel` | Por qué |
  | --- | --- | --- |
  | Deepseek v4 Flash | `xhigh` | built-in tlm: `xhigh → "max"` |
  | Deepseek v4 Pro | `xhigh` | built-in tlm: `xhigh → "max"` |
  | Kimi K2.7 Code | `high` | sin tlm → máx. soportado `high` |
  | Kimi K3 | `high` | sin built-in, sin tlm → máx. `high` |
  | MiniMax M3 | `high` | sin tlm → máx. `high` |
  | Qwen 3.7 Plus | `high` | sin tlm → máx. `high` |
  | Qwen 3.8 Max | `high` | sin built-in, sin tlm → máx. `high` |
  | MiMo V2.5 | `high` | sin tlm → máx. `high` |
  | MiMo V2.5 Pro | `high` | sin tlm → máx. `high` |

- Nueva función de lookup (usada por el route del chatbot):
  ```ts
  export function getDefaultThinkingLevel(modelId: InvocableModelId): ThinkingLevel | undefined;
  ```

**`models.json` no cambia.** `defaultThinkingLevel` no se emite en `models.json` (Pi no lo conoce; su schema es estricto). El default lo aplica el worker por sesión, no el registro de modelos.

### 2. Worker — `packages/coding-agent`

**`src/session-manager.ts`:**

- `getOrCreateSession(options)` acepta `thinkingLevel?: ThinkingLevel` (además de `modelId`) y lo aplica en **los tres caminos** — reuso en memoria, reload de disco y sesión nueva — desde un único punto de salida (`resolveSessionEntry` devuelve la entry, `getOrCreateSession` aplica el nivel). El nivel viaja con cada prompt, así que no hay caso en el que haya que "no tocarlo": lo que manda el cliente es lo que la UI está enseñando.
- `applyThinkingLevel(session, level)`: no-op sin nivel; Pi clampea a las capacidades del modelo, así que un nivel no soportado nunca es un error.
- RPC nuevo, mismo patrón que `getSessionModel` (incluido el cold reload vía `loadSessionFromDisk`):
  - `getSessionThinkingLevel({ sessionId, piSessionId, project })` → `{ level: ThinkingLevel; levels: ThinkingLevel[] }`, o `null` si el worker no tiene sesión (aún sin mensajes). Solo lo usa la UI para sembrar su control.
- `getAvailableModels` expone `levels` por modelo (calculados con `getSupportedThinkingLevels` sobre `reasoning` + `thinkingLevelMap` del registry): es la única forma de saber los niveles de un modelo *antes* de que exista sesión.

**`src/transports/http.ts`:** registrar `getSessionThinkingLevel` en `handleRpc` (+ `summarizeRpcParams` / `summarizeRpcResult`).

### 3. Chatbot — UI y bridge

**`lib/features/code/worker-client.ts`:** método `getSessionThinkingLevel` y el param `thinkingLevel` en `initializeSession`.

**`app/(chat)/api/agent/code/route.ts` (POST, flujo de mensaje):** leer `thinkingLevel` del `context`/`forwardedProps`, validarlo con `isThinkingLevel` (de `models`) y pasar a `client.initializeSession({ ..., thinkingLevel })`. Si el cliente no manda nada, se cae al `getDefaultThinkingLevel(modelId)` del catálogo.

**`lib/features/code/actions.ts`:** `getCodingAgentModels()` devuelve `{ id, levels, defaultLevel }` por modelo — único canal de lo que la UI necesita saber de razonamiento (los `levels` solo los conoce el worker; el `defaultLevel`, solo el catálogo).

**`GET /api/agent/code/sessions/[sessionId]/thinking-level`:** solo lectura. Sirve para sembrar el control con el nivel real de una sesión que ya ha corrido. No hay POST: escribir es cosa del route del run.

**Hook `lib/features/code/hooks/use-coding-agent-session-thinking-level.ts`:** estado de UI, no sincronizador.
- `level` sale, por orden: del `defaultLevel` del modelo del picker (inmediato, es lo que hace usable el control en una sesión nueva), del GET si el worker ya tiene sesión, y de lo que elija el usuario.
- Al cambiar de modelo en el picker, `level` se resetea al default del modelo nuevo — que es justo lo que el worker aplicará al enviar.
- `setLevel` es local: sin red. Un token de secuencia descarta la respuesta del GET inicial si para cuando llega el usuario ya cambió de modelo o de nivel.

**`components/code/agent-code-chat-layout.tsx`:** el header mantiene el `ModelPickerSelector` con `useCodingAgentSessionModel` (estado local puro, sin POST). Recibe `modelThinking` (`{ levels, defaultLevel }` por modelo) y lo propaga a `AgentCodeChat`.

**`components/code/agent-code-chat.tsx`:** en la fila izquierda de controles del textarea (junto a `AttachmentsControl` y `SkillsControl`), un nuevo chat control con icono de settings (`Settings2` de lucide) que despliega un dropdown con los niveles disponibles (reutilizando `components/ui/dropdown`, igual que `Select`). El nivel actual va en el tooltip/`aria-label` del botón (p.ej. `Reasoning effort: high`); items con los niveles del modelo seleccionado; oculto si el modelo no razona (`levels.length <= 1`) y deshabilitado mientras el nivel no está resuelto (`level === null`). El header no cambia: el model picker sigue ahí y el control de reasoning vive en el textarea, donde hay espacio en mobile.

### Flujo de datos

1. El usuario abre la sesión → `useCodingAgentSessionModel` resuelve el modelo → el control de reasoning aparece con el default del catálogo de ese modelo, y el GET lo sustituye por el nivel real si la sesión ya existe en el worker.
2. El usuario cambia el modelo en el picker → el dropdown pasa a los niveles del modelo nuevo y el nivel al default del modelo nuevo. Nada viaja al worker todavía.
3. El usuario cambia el nivel en el dropdown → estado local, sin red.
4. El usuario envía un mensaje → `runAgent` mete `modelId` y `thinkingLevel` en el `context` → `POST /api/agent/code` → `initializeSession({ modelId, thinkingLevel })` → el worker crea/reusa/rehidrata la sesión, cambia el modelo si hace falta y aplica el nivel → Pi lo clampea y lo persiste en el session file.

### Edge cases y errores

- **Sesión nueva (worker sin sesión):** el GET devuelve `thinking: null` y la UI se queda con el default del catálogo. El control es usable desde el primer momento, antes del primer mensaje.
- **Modelo sin `defaultThinkingLevel`:** no se manda nivel; Pi usa su default (settings/`medium`). Todos los `userInvocable` actuales lo declaran.
- **Nivel no soportado por el modelo:** `setThinkingLevel` clampea; nunca falla.
- **Modelo sin reasoning:** `levels = ["off"]` → el dropdown no se muestra.
- **Cold reload (worker reiniciado):** `getSessionThinkingLevel` rehidrata desde disco como `getSessionModel`; y como el nivel viaja con el prompt, el camino de reload de `getOrCreateSession` lo aplica igual que los otros dos.
- **Efecto secundario de Pi:** `setThinkingLevel` también persiste un default global en `settings.json` del worker. No es problemático: cada prompt lleva el nivel que la UI está enseñando, que sobrescribe ese global.
- **Cambio de modelo mid-run:** el worker rechaza `setModel` mientras la sesión está streaming (guard en `getOrCreateSession`); con el picker lazy esto no ocurre en el flujo normal (el modelo viaja con el mensaje y el input está deshabilitado durante los runs).
- **Worker caído al sembrar:** el GET falla en silencio y se mantiene el default del catálogo; el control sigue usable.

### Testing

- **`packages/models`:** test del catálogo — todo `userInvocable` con `reasoning: true` declara `defaultThinkingLevel` válido; `getDefaultThinkingLevel` devuelve el valor correcto.
- **Worker (`packages/coding-agent`, tests en `packages/chatbot/tests/unit/agent-code/` siguiendo `session-manager-skills.test.ts`):** `getSessionThinkingLevel` con runtime de Pi mockeado (lectura, sesión inexistente) y `applyThinkingLevel`; `getOrCreateSession` aplica el nivel en los tres caminos — reuso sin cambio de modelo, cambio de modelo y reload de disco (este último con el SDK de Pi mockeado, `session-manager-thinking-level-reload.test.ts`).
- **Chatbot:** route `POST /api/agent/code` (el nivel del context gana; sin él o inválido, el default del catálogo); `GET thinking-level` (nivel, `thinking: null`, 404); hook (siembra desde el catálogo, el GET la sustituye, reset al cambiar de modelo sin refetch, descarte del GET tardío, `setLevel` sin red); `useCodingAgent` mete `thinkingLevel` en el context del run; render del control (oculto sin reasoning, dropdown, no envía el form).

## Fuera de alcance

- Aplicar el modelo al vuelo desde el picker (B2): probado y revertido; el modelo viaja con el prompt.
- Cambiar el nivel de una sesión sin enviar mensaje: no existe tal cosa — el nivel solo tiene efecto en un turno, así que se aplica al enviar.
- Control de reasoning en el chat normal (no coding agent): el chat ya usa `providerOptions` del catálogo; no se toca.
- Persistir el nivel en la BD (`codingAgentSessions`): Pi ya lo persiste en la sesión; añadir columna sería redundante.
