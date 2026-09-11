# Diseño — Botón "Markdown a sesión" en el file browser

Fecha: 2026-08-14
Estado: borrador pendiente de revisión

## Objetivo

En el file browser del coding agent, al ver un archivo Markdown (vista de archivo o de diff, igual que el toggle Raw/Preview), aparece un botón flotante en la esquina inferior derecha. Al pulsarlo se abre un modal con:

- El nombre del archivo como contexto.
- Un **model picker** encima del textarea.
- Un textarea para escribir un **prefix** (solo el prefix; el contenido del markdown se añade invisiblemente).
- Los chat controls del coding agent: **skills** (incluida la pestaña prompts), **undo/refine** del prompt y **enviar**. Fuera del MVP: adjuntos (files) y reasoning level.

Al enviar: se crea una sesión nueva con el modelo elegido, se navega a ella y el prompt compuesto (`prefix + "\n\n" + contenido markdown`, con los skill commands prepended) se **envía automáticamente** cuando la sesión está lista.

## Flujo de usuario

1. El usuario abre un `.md`/`.markdown` en el file browser (vista archivo o diff).
2. Botón flotante abajo a la derecha (mismo estilo que Raw/Preview), con el icono `Send` de lucide.
3. Click → modal. Textarea vacío (placeholder tipo "Instrucciones para la sesión…"), model picker encima, chips de skills seleccionados sobre el textarea, controles abajo (skills, undo, refine, enviar).
4. El usuario escribe el prefix, elige modelo y skills, pulsa enviar.
5. `createCodingAgentSession(project, modelId, initialPrompt?)` (server action): **la misma petición crea la sesión e inicia el primer turno en el servidor** — inserta la fila, inicializa la sesión en el worker con el modelo elegido y llama a `sendPrompt` con el prompt (turno detached). Devuelve `{ sessionId }` → `router.push` a `/agent/code/<project>/<sessionId>`.
   - Nota: tras el cambio de IDs unificados (`feat(agent-code): unify session IDs`, commit `7add9dc`), `piSessionId` ya no existe en el flujo: el `sessionId` de la app es directamente el id de sesión del worker. Sin mapeos ni columnas extra.
6. Se navega a la sesión como a **cualquier sesión abierta**: el boot normal (snapshot + connect + replay) reejecuta los eventos del turno ya iniciado desde el event log del worker y sigue en vivo. El agente ya está trabajando aunque el cliente aún no haya llegado.

## Arquitectura

### 1. Botón — `code-view-frame.tsx` (modificar)

El contenedor del cuerpo (`<div className="relative flex-1 overflow-hidden">`) ya es el contexto de posicionamiento del toggle Raw/Preview. Se añade:

```tsx
{canRenderMarkdown && (
  <div className="absolute bottom-2 right-2 z-10">
    <Button variant="icon" size="icon" aria-label="Open markdown in a new coding agent session"
            className="p-2.5 shadow-sm bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            onClick={() => setSessionModalOpen(true)}>
      <Send size={16} />
    </Button>
  </div>
)}
```

- Misma condición de visibilidad que el toggle: `canRenderMarkdown` (`load.status === "ready"` + ruta markdown + `sourceContent` presente). Vale para vista archivo y diff.
- Estado `sessionModalOpen` local a `CodeViewFrame`; el modal recibe `path`, `content={load.sourceContent}` y de `useFileBrowser()` `project` y `sessionId`.

### 2. Modal — `components/code/markdown-to-session-modal.tsx` (nuevo)

Componente `"use client"` con la misma estructura de overlay que `prompt-form-modal.tsx` (overlay `fixed inset-0 z-50 bg-black/50`, panel `max-w-2xl`). Props:

```ts
interface MarkdownToSessionModalProps {
  open: boolean;
  onClose: () => void;
  path: string;        // para mostrar el nombre del archivo
  content: string;     // fuente markdown completa (del load de CodeViewFrame)
  project: string;     // de useFileBrowser
  sessionId: string;   // de useFileBrowser (sesión actual, para defaults)
}
```

Contenido del panel:

- **Cabecera**: título ("New session from `<filename>`") + botón cerrar (X).
- **Model picker**: `ModelPickerSelector` con `dropdownVariant="responsive-bottom-right"`.
  - Modelos disponibles: GET existente `/api/agent/code/models` (fetch en el modal, patrón de los hooks `use-coding-agent-*`).
  - Default: modelo de la sesión actual vía `useCodingAgentSessionModel({ sessionId, fallbackModelId: availableModels[0] })`; mientras carga, `ModelPickerLoading`.
- **Textarea**: componente `Textarea` de `components/chat/textarea.tsx` (autosize, Enter envía) dentro de un `<form onSubmit>` propio del modal. Solo el prefix.
- **Skills**: `SkillsControl` con `useCodingAgentSkills(sessionId)` y `useCodingAgentPrompts(sessionId)` (sesión actual: el GET inicializa la sesión en el worker y devuelve el catálogo del proyecto). `onPromptSelect` abre el `PromptFormModal` existente; `onInsert` añade el texto del prompt al prefix. Chips `SkillChip` sobre el textarea vía `leadingContent`.
- **Controles derecha**: `ChatControl` Undo (si `hasPreviousMessage`), `ChatControl` WandSparkles (refine), `ChatControl` ArrowUp submit — usando `usePromptRefiner({ mode: "coding-agent" })` como en `agent-code-chat.tsx`. Enviar deshabilitado si no hay prefix y no hay skills seleccionados; `isLoading` mientras se crea la sesión.
- **Sin** `AttachmentsControl` ni `ReasoningControl` (MVP).

### 3. Envío — composición del prompt

En el submit del modal:

```ts
const base = prependSkillCommands(prefix.trim(), selectedSkills);
const prompt = base ? `${base}\n\n${content}` : content;
```

Regla: el contenido del markdown siempre se añade al final. Si el prefix está vacío y no hay skills, el envío se deshabilita (nada que añadir al contenido).

El submit llama `createCodingAgentSession(project, modelId, prompt)` con el prompt compuesto y el modelo elegido; la action arranca además el turno en el servidor. Con el `sessionId` devuelto se navega (`router.push`) y el cliente no guarda nada localmente ni hace nada especial al boot: es una sesión ya corriendo.

### 4. Handoff — el servidor crea la sesión e inicia el primer turno

Sin `sessionStorage`, sin columna en BD y sin lógica nueva en el cliente: la primera petición (el submit del modal) hace todo el trabajo de arranque y el resto es navegar a una sesión ya en marcha, igual que se navega a cualquier sesión abierta.

**`createCodingAgentSession(project, modelId, initialPrompt?)`** — extender la action (`lib/features/code/actions.ts`), siguiendo el patrón de la ruta `run` `/api/agent/code`:

1. `createSession({ userId, project, modelId })` → inserta la fila; devuelve `{ sessionId }`. Backward compatible: el botón "+" actual llama sin `initialPrompt`.
2. `client.initializeSession({ sessionId, project, modelId: '<provider>/<model>' via toPiModelId(modelId), thinkingLevel: getDefaultThinkingLevel(modelId), _traceRunId })` → el worker crea la sesión Pi con el modelo elegido en el modal. El nivel de razonamiento es lazy y viaja con el prompt: sin UI de reasoning en el MVP, se pasa el default del catálogo (igual que hace la ruta `run` cuando el cliente no envía nivel).
3. `client.sendPrompt({ sessionId, prompt: initialPrompt, _traceRunId })` → arranca el primer turno **detached**: `runtime.session.prompt(...)` corre al margen de la respuesta HTTP y todos los eventos se escriben en el `SessionEventLog` del worker.
4. Label: `parseLeadingSkillCommands(prompt).text` → primera línea truncada a 80 como nombre de sesión (como hace la ruta `run`), para que aparezca con nombre en listas/selectores.

El stream que devuelve `sendPrompt` se **cancela de inmediato** en la action (`res.body?.cancel()`): el turno sigue porque `startPromptCollector` ya subscribió el runtime y loguea eventos independientemente del stream — cancelar solo desuscribe el tee, no aborta el run. Es el mismo comportamiento documentado en el worker: "The turn runs detached from the `sendPrompt` request", y `connectToSession` replaya desde `eventLog.readAfter(afterSeq)`.

### 5. Cliente — sin cambios

Al navegar, `useCodingAgent` hace el boot normal (snapshot + connect con `afterSeq`/`epoch`), replaya desde el event log (incluido el turno ya iniciado) y continúa en vivo. Es el camino exacto de "reabrir una sesión": el agente ya está trabajando aunque el navegador aún no haya llegado a conectar. No hay columna en BD, ni claim, ni efecto nuevo en `agent-code-chat.tsx`.

## Manejo de errores

- Fallo en `createCodingAgentSession` (BD, `initializeSession` o `sendPrompt`) → `toast.error("Failed to create coding agent session")` (mismo mensaje que `useCreateCodingAgentSession`), modal permanece abierto con el prefix intacto.
- Modelos sin cargar → skeleton `ModelPickerLoading`; el envío se deshabilita hasta que haya modelo.
- Si el worker falla tras crear la fila (p. ej. `sendPrompt` con error), queda una sesión huérfana en BD sin turno — inofensiva, equivalente a una sesión creada y nunca usada.

## Edge cases

- Prefix vacío + skill seleccionada → prompt = `!skill-comando + "\n\n" + contenido`.
- Archivo binario/tooLarge → `canRenderMarkdown` false → sin botón.
- Sesión actual sin modelo resuelto aún → el picker del modal muestra skeleton hasta que el GET responda.
- El modal se cierra con Escape/overlay/cerrar sin efectos secundarios (no se crea sesión ni se persiste nada hasta enviar).
- El turno termina antes de que el navegador conecte → el boot replaya la conversación ya terminada tal cual (mismo camino que reabrir una sesión completada).
- Navegador cerrado tras crear la sesión → el turno igualmente corre en el worker y queda registrado en el event log; al volver a la sesión se ve el resultado (no se pierde nada ni se re-dispara).

## Testing (tests de componente, patrón `tests/component/agent-code/`)

- **code-view-frame**: el botón aparece solo cuando `canRenderMarkdown` (markdown listo), en vista archivo y en diff; no aparece en raw de no-markdown.
- **markdown-to-session-modal** (nuevo test): renderiza prefix vacío + nombre de archivo + model picker + skills + refine + send; sin attachments ni reasoning; composición del prompt (`prefix\n\ncontent`, skills prepended); submit llama `createCodingAgentSession(project, modelId, prompt)` con el prompt compuesto y hace `router.push` con el `sessionId` devuelto; fallo de creación → toast y modal abierto.
- **createCodingAgentSession con prompt** (unit/integración, worker mockeado): inserta la fila con `modelId`, inicializa la sesión en el worker con el modelo mapeado (`toPiModelId`), llama `sendPrompt` con el prompt compuesto y cancela el stream; setea el label desde la primera línea del prompt; sin `initialPrompt` → solo inserta la fila (comportamiento del botón "+" sin cambios).
- **Sin cambios en `agent-code-chat`**: no hay claim ni efecto nuevo; el boot normal ya replaya la sesión en marcha.

## Alcance

**Incluido (MVP)**: botón en ambas vistas, modal con prefix + model picker + skills/prompts + undo/refine + send, el servidor crea la sesión e inicia el primer turno (`initializeSession` + `sendPrompt` detached) y el cliente navega a la sesión como a cualquier otra (reconnect/replay).

**Excluido**: adjuntos (files), reasoning level, columna/claim en BD, `sessionStorage`, persistencia de un prompt previo en el cliente.
