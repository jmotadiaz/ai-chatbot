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
- Fetch inicial cuando la sesión/modelo se resuelve y **refetch cuando cambia `modelId`** (el worker aplicó el default del nuevo modelo).
- `setLevel(level)` → POST → actualiza el estado local con el nivel efectivo devuelto.
- No renderiza el control si `levels.length <= 1` (modelo sin reasoning → solo `"off"`).

**`components/code/agent-code-chat.tsx`:** en la fila izquierda de controles del textarea (junto a `AttachmentsControl` y `SkillsControl`), un nuevo chat control con icono de settings (`Settings2` de lucide) que despliega un dropdown con los niveles disponibles (reutilizando `components/ui/dropdown`, igual que `Select`). Muestra el nivel actual como etiqueta del botón (p.ej. `high`), items con los niveles disponibles, deshabilitado mientras carga o si el modelo no razona (`levels.length <= 1`). El header no cambia: el model picker sigue ahí y el control de reasoning vive en el textarea, donde hay espacio en mobile.

### Flujo de datos

1. El usuario abre la sesión → `useCodingAgentSessionModel` resuelve el modelo → el nuevo hook resuelve `{ level, levels }` → el header muestra el picker de modelo y el textarea muestra el chat control de reasoning (si el modelo razona).
2. El usuario envía un mensaje → `POST /api/agent/code` deriva `defaultThinkingLevel` del `modelId` del context → `initializeSession(modelId, defaultThinkingLevel)` → el worker crea la sesión (o cambia el modelo) aplicando el default → Pi lo persiste en el session file.
3. El usuario abre el chat control de settings en el textarea y cambia el nivel → `setCodingAgentSessionThinkingLevel` → RPC `setSessionThinkingLevel` → `session.setThinkingLevel(level)` → nivel efectivo devuelto → el botón del control lo refleja.
4. El usuario cambia el modelo en el picker → el próximo mensaje lleva el nuevo `modelId` → el worker hace `setModel` + `setThinkingLevel(default del nuevo modelo)` → el hook refetcha y la UI muestra el nuevo nivel/niveles.

### Edge cases y errores

- **Modelo sin `defaultThinkingLevel`:** no se aplica nada; Pi usa su default (settings/`medium`). Todos los `userInvocable` actuales lo declaran.
- **Nivel no soportado por el modelo:** `setThinkingLevel` clampea; nunca falla. Se devuelve el nivel efectivo.
- **Modelo sin reasoning:** `levels = ["off"]` → el dropdown no se muestra.
- **Cold reload (worker reiniciado):** `getSessionThinkingLevel`/`setSessionThinkingLevel` rehidratan desde disco como `getSessionModel`; el nivel vuelve de la sesión persistida.
- **Efecto secundario de Pi:** `setThinkingLevel` también persiste un default global en `settings.json` del worker. No es problemático: las sesiones nuevas siempre aplican el default del catálogo (que sobrescribe ese global). Se documenta en el código.

### Testing

- **`packages/models`:** test del catálogo — todo `userInvocable` con `reasoning: true` declara `defaultThinkingLevel` válido; `getDefaultThinkingLevel` devuelve el valor correcto.
- **Worker (`packages/coding-agent`, tests en `packages/chatbot/tests/unit/agent-code/` siguiendo `session-manager-skills.test.ts`):** `getSessionThinkingLevel`/`setSessionThinkingLevel` con runtime de Pi mockeado — lectura, escritura, clamp (nivel efectivo), cold reload, sesión inexistente; `getOrCreateSession` aplica el default al crear y al cambiar modelo, y no lo aplica en reload.
- **Chatbot:** test del route `POST /api/agent/code` derivando `defaultThinkingLevel` del `modelId`; test del hook (fetch inicial, refetch al cambiar modelo, setLevel); test de render del chat control en el textarea (visible solo con modelo que razona, dropdown con los niveles, cambio de nivel).

## Fuera de alcance

- Emitir `thinkingLevelMap` desde el catálogo (hoy los modelos heredan el del built-in de Pi; si algún día se quiere restringir/exponer `xhigh` para un modelo sin built-in, será un cambio aparte).
- Control de reasoning en el chat normal (no coding agent): el chat ya usa `providerOptions` del catálogo; no se toca.
- Persistir el nivel en la BD (`codingAgentSessions`): Pi ya lo persiste en la sesión; añadir columna sería redundante.
