# Diseño — Reasoning effort configurable en el coding agent

**Fecha:** 2026-08-07
**Estado:** propuesta (sin commit)

## Resumen

El coding agent no permite controlar el esfuerzo de razonamiento (reasoning effort). Este diseño añade:

1. **Default por modelo** — el catálogo (`packages/models`) declara un `defaultThinkingLevel` por modelo; el worker lo aplica al crear una sesión y al cambiar de modelo.
2. **Control por sesión desde la UI** — un chat control con icono de settings dentro del textarea del coding agent (junto a los controles de attachments/skills) despliega un dropdown para cambiar el nivel de razonamiento de la sesión actual.

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
| 4 | Cuándo se aplica el cambio de modelo del picker | **Lazy (revertido de B2)**: el modelo vuelve a viajar con el prompt (cambiar el picker mid-run era problemático: `setModel` sobre una sesión streaming). El dropdown de reasoning es **informativo (B1)**: muestra los niveles del modelo *seleccionado* en el picker (exponiendo `levels` por modelo en `getAvailableModels`), mientras que el nivel activo sigue viniendo de la sesión. El guard del worker que rechaza `setModel` en sesiones streaming se mantiene como defensa. |

> Nota post-implementación: el `thinkingLevelMap` de los built-ins de Pi NO se hereda en runtime (Pi reemplaza el built-in entero con la entrada de `models.json`), así que `generateModelsJson` lo emite explícitamente desde el baseline (commit `7f9207e`). B2 se probó y se revirtió (cambiar el modelo mid-run); en su lugar `getAvailableModels` expone `levels` por modelo y el dropdown los muestra para el modelo seleccionado (B1).

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

- `getOrCreateSession(options)` acepta `defaultThinkingLevel?: ThinkingLevel` (además de `modelId`):
  - **Sesión nueva:** tras crear el runtime, si viene el nivel → `runtime.session.setThinkingLevel(defaultThinkingLevel)`.
  - **Cambio de modelo en sesión existente:** tras el `session.setModel(model)` existente, si viene el nivel → `session.setThinkingLevel(defaultThinkingLevel)` (sobrescribe el re-clamp de `setModel` con el default del nuevo modelo).
  - **Sesión existente sin cambio de modelo:** no tocar.
  - **Sesión cargada de disco:** no aplicar (el nivel se restaura de la sesión persistida).

- Nuevos RPCs (mismo patrón que `getSessionModel`, incluido el cold reload vía `loadSessionFromDisk`):
  - `getSessionThinkingLevel({ sessionId, piSessionId, project })` → `{ level: ThinkingLevel; levels: ThinkingLevel[] }`, donde `levels = session.getAvailableThinkingLevels()` del modelo actual (contiene `"off"` cuando el modelo no razona).
  - `setSessionThinkingLevel({ sessionId, piSessionId, project, level })` → llama `session.setThinkingLevel(level)` y devuelve `{ level }` (el nivel efectivo tras el clamp de Pi).

**`src/transports/http.ts`:** registrar los dos casos nuevos en `handleRpc` (+ `summarizeRpcParams` / `summarizeRpcResult`).

### 3. Chatbot — UI y bridge

**`lib/features/code/worker-client.ts`:** métodos `getSessionThinkingLevel` y `setSessionThinkingLevel`.

**`app/(chat)/api/agent/code/route.ts` (POST, flujo de mensaje):** derivar el default del modelo seleccionado con `getDefaultThinkingLevel(modelId)` (de `models`) y pasarlo a `client.initializeSession({ ..., defaultThinkingLevel })`. Así tanto la creación como el cambio de modelo aplican el default del catálogo.

**`lib/features/code/actions.ts`:** actions server
- `getCodingAgentSessionThinkingLevel(sessionId, project)` → `{ level, levels }`
- `setCodingAgentSessionThinkingLevel(sessionId, project, level)` → `{ level }` (efectivo)

**Nuevo hook `lib/features/code/hooks/use-coding-agent-session-thinking-level.ts`:**
- Estado: `{ level, levels, isLoading }`.
- Fetch inicial cuando la sesión/modelo se resuelve, **refetch cuando cambia `modelId`** y **refetch cuando el cambio de modelo termina de aplicarse** (falling edge de `isApplyingModel` — el POST de modelo del picker es la fuente de verdad).
- `setLevel(level)` → POST → actualiza el estado local con el nivel efectivo devuelto.
- No renderiza el control si `levels.length <= 1` (modelo sin reasoning → solo `"off"`).

**`components/code/agent-code-chat-layout.tsx`:** el header mantiene el `ModelPickerSelector` con `useCodingAgentSessionModel` (estado local puro, sin POST — el modelo viaja con el prompt). Recibe `modelLevels` (niveles por modelo del picker) y los propaga a `AgentCodeChat`.

**Dropdown informativo (B1):** `getAvailableModels` del worker expone `levels` por modelo (calculados con `getSupportedThinkingLevels` sobre `reasoning` + `thinkingLevelMap` del registry). El hook de thinking recibe los `levels` del modelo *seleccionado* en el picker como prop (no los del modelo activo) y los usa para el dropdown; el `level` activo sigue viniendo de la sesión (GET `thinking-level`). El `POST sessions/[sessionId]/model` de B2 se elimina.

**`components/code/agent-code-chat.tsx`:** en la fila izquierda de controles del textarea (junto a `AttachmentsControl` y `SkillsControl`), un nuevo chat control con icono de settings (`Settings2` de lucide) que despliega un dropdown con los niveles disponibles (reutilizando `components/ui/dropdown`, igual que `Select`). Muestra el nivel actual como etiqueta del botón (p.ej. `high`), items con los niveles disponibles, deshabilitado mientras carga o si el modelo no razona (`levels.length <= 1`). El header no cambia: el model picker sigue ahí y el control de reasoning vive en el textarea, donde hay espacio en mobile.

### Flujo de datos

1. El usuario abre la sesión → `useCodingAgentSessionModel` resuelve el modelo → el nuevo hook resuelve `{ level, levels }` → el header muestra el picker de modelo y el textarea muestra el chat control de reasoning (si el modelo razona).
2. El usuario envía un mensaje → `POST /api/agent/code` deriva `defaultThinkingLevel` del `modelId` del context → `initializeSession(modelId, defaultThinkingLevel)` → el worker crea la sesión (o cambia el modelo) aplicando el default → Pi lo persiste en el session file.
3. El usuario cambia el modelo en el picker → el dropdown de reasoning muestra al instante los niveles del modelo seleccionado (de `getAvailableModels`, sin esperar al worker); el nivel activo de la sesión no cambia hasta que el próximo mensaje aplica el modelo (+ `defaultThinkingLevel`), momento en el que el post-run refetch actualiza el nivel.
4. El usuario abre el chat control de settings en el textarea y cambia el nivel → `setCodingAgentSessionThinkingLevel` → RPC `setSessionThinkingLevel` → `session.setThinkingLevel(level)` → nivel efectivo devuelto → el botón del control lo refleja.

### Edge cases y errores

- **Modelo sin `defaultThinkingLevel`:** no se aplica nada; Pi usa su default (settings/`medium`). Todos los `userInvocable` actuales lo declaran.
- **Nivel no soportado por el modelo:** `setThinkingLevel` clampea; nunca falla. Se devuelve el nivel efectivo.
- **Modelo sin reasoning:** `levels = ["off"]` → el dropdown no se muestra.
- **Cold reload (worker reiniciado):** `getSessionThinkingLevel`/`setSessionThinkingLevel` rehidratan desde disco como `getSessionModel`; el nivel vuelve de la sesión persistida.
- **Efecto secundario de Pi:** `setThinkingLevel` también persiste un default global en `settings.json` del worker. No es problemático: las sesiones nuevas siempre aplican el default del catálogo (que sobrescribe ese global). Se documenta en el código.
- **Cambio de modelo mid-run:** el worker rechaza `setModel` mientras la sesión está streaming (guard en `getOrCreateSession`); con el picker lazy esto no ocurre en el flujo normal (el modelo viaja con el mensaje y el input está deshabilitado durante los runs).
- **Nivel activo no soportado por el modelo seleccionado:** el check del dropdown solo se marca si el nivel de la sesión está en los niveles del modelo seleccionado; el `title` del botón siempre muestra el nivel activo real.

### Testing

- **`packages/models`:** test del catálogo — todo `userInvocable` con `reasoning: true` declara `defaultThinkingLevel` válido; `getDefaultThinkingLevel` devuelve el valor correcto.
- **Worker (`packages/coding-agent`, tests en `packages/chatbot/tests/unit/agent-code/` siguiendo `session-manager-skills.test.ts`):** `getSessionThinkingLevel`/`setSessionThinkingLevel` con runtime de Pi mockeado — lectura, escritura, clamp (nivel efectivo), cold reload, sesión inexistente; `getOrCreateSession` aplica el default al crear y al cambiar modelo, y no lo aplica en reload.
- **Chatbot:** test del route `POST /api/agent/code` derivando `defaultThinkingLevel` del `modelId`; test de `getAvailableModels` con `levels` por modelo (worker) y del bridge (actions/page); test del hook de thinking (fetch inicial del nivel, dropdown usa los `levels` del modelo seleccionado, setLevel, refetch post-run); test de render del chat control en el textarea (visible solo con modelo que razona, dropdown con los niveles del modelo seleccionado, cambio de nivel).

## Fuera de alcance

- Aplicar el modelo al vuelo desde el picker (B2): probado y revertido; el modelo viaja con el prompt.
- Control de reasoning en el chat normal (no coding agent): el chat ya usa `providerOptions` del catálogo; no se toca.
- Persistir el nivel en la BD (`codingAgentSessions`): Pi ya lo persiste en la sesión; añadir columna sería redundante.
