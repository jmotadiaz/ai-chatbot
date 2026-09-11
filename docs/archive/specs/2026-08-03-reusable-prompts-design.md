# Prompts Reutilizables — Diseño

**Fecha:** 2026-08-03
**Estado:** Propuesta (pendiente de revisión)
**Contexto:** Conversación de diseño con el usuario — "explorar que el coding agent tenga prompts reutilizables como templates". Se eligió un formato basado en el estándar [Prompty](https://prompty.ai/) extendido con kinds y propiedades específicos del dominio. Flujo UX de modal form → inserción en textarea (B+C).

## 1. Problema

El coding agent recibe prompts de texto libre escritos por el usuario en el textarea. No hay forma de reutilizar prompts entre sesiones, parametrizarlos con valores pre-rellenados, ni componer unos con otros. Esto es especialmente útil para flujos repetitivos (code review de sesiones, generación de tests para un archivo concreto, análisis de una sesión previa) donde el usuario copia/pega y reescribe variantes del mismo prompt una y otra vez.

## 2. Decisiones tomadas (con el usuario)

| # | Decisión | Elección |
|---|----------|----------|
| D1 | Origen de los prompts | **Tres niveles**: built-in del harness (`packages/coding-agent/prompts/`) → globales (paquetes Pi) → locales al proyecto (`.agents/prompts/`). Se **descubren** con el mismo mecanismo de escaneo de directorios que las skills, pero **nunca se cargan en el system prompt de Pi**. Los prompts solo se listan en la UI y se renderizan bajo demanda. |
| D2 | Flujo UX al seleccionar | **B+C híbrido**: se abre un modal con un form para rellenar los inputs, y al confirmar el texto renderizado se inserta en la posición del cursor en el textarea. El usuario puede editarlo antes de enviar. |
| D3 | Render de cada input | **Configurable por input** (`render` en el frontmatter). El autor del prompt decide si una sesión se inserta como link markdown, como id, como etiqueta, o como resumen inline. |
| D4 | Formato de archivo | **`.prompty`** — basado en el estándar [Prompty](https://prompty.ai/specification/file-format): YAML frontmatter con schema Prompty-compatible (`inputs[].name`, `inputs[].kind`, `inputs[].description`, `inputs[].required`, `inputs[].default`, `inputs[].enumValues`) + plantilla Mustache (`{{var}}`) en el cuerpo. Se extiende con kinds custom (`session`, `path`, `prompt`) y propiedades adicionales (`render`, `basePath`, `placeholder`). Ver §4.1.1. |
| D5 | Prompts en el selector de skills | **Tabs** bajo el mismo icono `Puzzle`: una pestaña "Skills", otra "Prompts". Se descubren y listan juntos. |
| D6 | Inputs inferidos | Un `{{var}}` en el cuerpo sin entrada en `inputs` se trata como `kind: string, required: false`. Warning en consola, no bloquea. |
| D7 | Shadowing entre niveles | Prioridad de menor a mayor: built-in < paquete Pi < proyecto (`.agents/prompts/`). El local siempre gana. |
| D8 | Composición de prompts | Un input con `kind: prompt` permite seleccionar otro prompt como valor. El `render` configurable (`reference`, `body`, `name`) controla el formato de inserción. |

## 3. Arquitectura

```
Prompt files (3 niveles, shadowing en orden inverso:
  built-in:  packages/coding-agent/prompts/<name>/prompt.prompty
  globales:  Pi packages/<pkg>/prompts/<name>/prompt.prompty
  proyecto:  <root>/.agents/prompts/<name>/prompt.prompty)
       │
       │  NOTA: los prompts se descubren escaneando directorios (mismo patrón que
       │  skills) pero NUNCA se cargan en el system prompt de Pi. Solo se listan
       │  en la UI y se renderizan bajo demanda cuando el usuario los selecciona.
       │
       ├─► Worker (packages/coding-agent)
       │     ├─ loadPrompts(): escanea los 3 niveles, fusiona con shadowing
       │     ├─ getSessionPrompts(sessionId): RPC nueva → devuelve { name, description, inputs }
       │     │     inputs = la metadata necesaria para que el frontend construya el form
       │     ├─ resolvePrompt(promptName, values): RPC nueva → renderiza el prompt con valores
       │     │     devuelve el texto final (ya con {{var}} → valor + renders aplicados)
       │     │     validación: inputs con required sin valor → error
       │     └─ getSessionSkills (existente) — sin cambios
       │
       ├─► Frontend (packages/chatbot)
       │     ├─ SkillsControl → pasa a ser tabbed: "Skills" | "Prompts"
       │     │     (mismo icono Puzzle, mismo componente ChatControl)
       │     ├─ useCodingAgentPrompts(sessionId) — hook nuevo, hermano de useCodingAgentSkills
       │     │     fetch GET /api/agent/code/sessions/[sessionId]/prompts
       │     ├─ PromptFormModal — componente nuevo
       │     │     renderiza el form a partir de inputs, llama a resolvePrompt, inserta en textarea
       │     └─ WorkerClient — gana getSessionPrompts, resolvePrompt
       │
       └─► API routes (chatbot)
             ├─ GET /api/agent/code/sessions/[sessionId]/skills → sin cambios
             └─ GET /api/agent/code/sessions/[sessionId]/prompts → nuevo
                    POST /api/agent/code/sessions/[sessionId]/prompts/resolve → nuevo
```

### 3.1 Discovery ≠ carga en system prompt

A diferencia de las skills, que se inyectan en el contexto de Pi como bloques `<skill>`, los prompts **nunca** entran en el system prompt. El mecanismo de escaneo de directorios es el mismo, pero el propósito es distinto:

- **Skills**: se cargan al inicio de la sesión Pi y se expanden inline cuando el usuario selecciona una (`/skill:<name>`). Son instrucciones de comportamiento para el LLM.
- **Prompts**: se listan en la UI y solo existen como catálogo. Cuando el usuario selecciona uno, se renderiza en el worker (`resolvePrompt`) y el texto resultante se inserta en el textarea del usuario. Pi nunca ve el archivo `.prompty` original; solo ve el texto ya renderizado como parte del mensaje del usuario.

### 3.2 Los tres niveles de prompts

| Nivel | Ubicación | Prioridad | Ejemplos de uso |
|-------|-----------|-----------|-----------------|
| **Built-in** | `packages/coding-agent/prompts/` | Más baja (base) | "Review session", "Generate tests", "Explain file" — prompts genéricos que vienen con el harness |
| **Global (Pi packages)** | `.pi/packages/<pkg>/prompts/` | Media | Prompts curados por el equipo de plataforma, compartidos entre proyectos |
| **Proyecto** | `<projectRoot>/.agents/prompts/` | Más alta (gana) | Workflows específicos del repo, convenciones del equipo |

El shadowing es por `name`: si existe `code-review` en los tres niveles, solo se ve la versión del proyecto.

### 3.3 Por qué la expansión ocurre en el worker y no en el frontend

Los renders de tipo `session` y `path` requieren acceso a datos que el frontend no tiene directamente:
- `session` → el worker mantiene el `sessions` Map con acceso a los mensajes y metadata de la sesión para `render: summary`.
- `path` → el worker tiene acceso al filesystem del proyecto para `render: contents`.

Además, separar descubrimiento (RPC `getSessionPrompts`) de renderizado (RPC `resolvePrompt`) permite:
- Validar los valores en el backend (los paths existen, las sesiones existen).
- Cambiar la lógica de render sin desplegar el frontend.
- Cachear el catálogo de prompts (inmutable durante la vida de una sesión Pi).

## 4. Cambios en `packages/coding-agent`

### 4.1 Formato de archivo — `prompt.prompty`

Cada prompt es un directorio con un archivo `prompt.prompty` (igual que las skills usan `skills/<name>/SKILL.md`, los prompts usan `prompts/<name>/prompt.prompty`). El archivo sigue el estándar [Prompty](https://prompty.ai/) con extensiones documentadas.

**Estructura del frontmatter (Prompty estándar + extensiones):**

```yaml
---
name: string              # Identificador único en el catálogo (Prompty estándar)
description: string        # Descripción visible en el dropdown de la UI (Prompty estándar)
inputs:                    # Prompty estándar: array de Property
  - name: string           # Variable: se referencia como {{name}} en el cuerpo (Prompty estándar)
    kind: string           # string | session | path | prompt (Prompty extiende los kinds estándar con session/path/prompt)
    description: string    # Etiqueta visible en el form (Prompty estándar)
    required: boolean      # Default: false (Prompty estándar)
    default: string        # Valor pre-rellenado (Prompty estándar)
    enumValues: string[]   # Opciones para kind: string cuando actúa como select (Prompty estándar)
    # ── Extensiones (no forman parte del spec Prompty; ver §4.1.1) ──
    placeholder: string    # Placeholder del input (solo kind: string, sin enumValues)
    render: string         # Cómo se convierte el valor en texto (depende de kind; ver tabla)
    basePath: string       # Solo kind: path. Directorio relativo al project root
  - ...
---
```

#### 4.1.1 Alineación con Prompty y extensiones

El formato es **Prompty-compatible** en su estructura base. Un parser Prompty estándar puede leer el frontmatter sin errores (el spec dice que *"unknown properties should be preserved or ignored without raising an error"*). Las diferencias con el spec Prompty son:

| Aspecto | Prompty estándar | Nuestro uso | Motivo |
|---------|-----------------|-------------|--------|
| Extensión | `.prompty` | `.prompty` | Igual |
| `inputs[].kind` | `string`, `integer`, `float`, `boolean`, `array`, `object`, `image`, `file`, `audio` | Añadimos `session`, `path`, `prompt` | Los kinds estándar no cubren nuestros pickers de dominio |
| `inputs[].description` | Texto descriptivo | Lo usamos como `label` del campo en el form | Equivalente funcional |
| `inputs[].enumValues` | `string[]` | `string[]` (a futuro podríamos extender a `{value,label}[]`) | Compatible; en v1 los labels se derivan de los valores |
| `inputs[].render` | No existe | Propiedad nuestra | Controla cómo se convierte el valor a texto (reference, contents, summary, etc.) |
| `inputs[].basePath` | No existe | Propiedad nuestra | Raíz del file picker para `kind: path` |
| `inputs[].placeholder` | No existe | Propiedad nuestra | Placeholder HTML para `kind: string` |
| Template | Jinja2 (`{{var}}`, `{% for %}`, `{% if %}`) | Usamos solo `{{var}}` (subconjunto Mustache compatible con Jinja2) | Suficiente para v1; los bloques de control se pueden añadir sin migrar prompts existentes |
| `model` | Configuración del LLM | No se usa (los prompts no se ejecutan, solo se renderizan) | Se ignora si está presente |
| `outputs` | Schema de salida | No se usa | Se ignora si está presente |
| `tools` | Definiciones de tools | No se usa | Se ignora si está presente |

#### Tipos de `kind` y modos de render

| `kind` | Origen | Control en el form | `render` (valores) | `render` (default) | Efecto al renderizar |
|--------|--------|--------------------|--------------------|--------------------|--------------------|
| `string` | Prompty estándar | `<input type="text">` | N/A | N/A | Valor tal cual |
| `string` + `enumValues` | Prompty estándar | `<select>` | N/A | El valor elegido | El valor elegido como texto |
| `session` | Extensión | `<select>` con sesiones del proyecto | `reference`, `summary`, `id`, `label` | `reference` | `reference`: `[label](session:id)`; `summary`: resumen inline (~500 palabras); `id`: sessionId; `label`: título |
| `path` | Extensión | File picker con tree de `basePath` | `reference`, `contents`, `path` | `reference` | `reference`: `[path](file:path)`; `contents`: contenido entre triple backticks con lenguaje inferido; `path`: ruta relativa como texto |
| `prompt` | Extensión | `<select>` con catálogo de prompts | `reference`, `body`, `name` | `body` | `reference`: `[name](prompt:name)`; `body`: cuerpo del prompt ya renderizado; `name`: solo el nombre |

#### Ejemplo completo

Archivo: `.agents/prompts/code-review-session/prompt.prompty`

```markdown
---
name: code-review-session
description: Resume una sesión del coding agent y sugiere mejoras
inputs:
  - name: target_session
    kind: session
    description: Sesión a revisar
    required: true
    render: summary
  - name: relevant_file
    kind: path
    description: Archivo de referencia
    basePath: src/
    render: contents
  - name: focus_area
    kind: string
    description: Enfoque del review
    enumValues: [bugs, perf, style]
  - name: extra_context
    kind: string
    description: Notas adicionales
    placeholder: Algo más que el agente deba saber...
    required: false
---

# Code Review de la sesión {{target_session}}

## Archivo de referencia

{{relevant_file}}

## Enfoque: {{focus_area}}

{{extra_context}}

## Instrucciones

Analiza los cambios de la sesión, enfócate en **{{focus_area}}** y reporta:
1. Problemas encontrados
2. Sugerencias de mejora
3. Riesgos y trade-offs
```

### 4.2 Descubrimiento de prompts — `loadPrompts()`

Un método independiente de `loadSkills()` (mismo patrón de escaneo de directorios, pero sin relación con el system prompt de Pi).

```ts
interface CodingAgentPrompt {
  name: string;
  description: string;
  inputs: PromptInput[];       // metadata parseada del frontmatter YAML
  filePath: string;             // ruta absoluta al archivo .prompty
  baseDir: string;              // directorio base (para resolver paths relativos en kind: path)
  level: "builtin" | "package" | "project";  // para debugging/logging
}

interface PromptInput {
  name: string;
  kind: string;          // string | session | path | prompt
  description: string;   // label visible en el form
  required: boolean;
  default?: string;
  enumValues?: string[];
  // Extensiones
  placeholder?: string;
  render?: string;
  basePath?: string;
}
```

La carga fusiona tres niveles en orden de prioridad creciente:

1. **Built-in**: `packages/coding-agent/prompts/*/prompt.prompty` — escaneo directo del filesystem.
2. **Global (Pi packages)**: Pi carga los paquetes via `additionalExtensionPaths`. Igual que las skills escanean `skills/*/SKILL.md`, se escanea `prompts/*/prompt.prompty` en cada paquete.
3. **Proyecto**: `<projectRoot>/.agents/prompts/*/prompt.prompty`. Se descubre desde el worker porque el `projectRoot` está disponible al crear la sesión (`resolveProjectPath`).

**Fusión**: prompts de nivel superior con el mismo `name` hacen shadowing a los de nivel inferior (D7). El catálogo final es inmutable durante la vida de la sesión Pi.

**Importante**: `loadPrompts()` solo construye el catálogo en memoria. Los prompts **no** se pasan a `PiSession` ni se incluyen en el system prompt. Son exclusivamente para la UI.

Validación al cargar:
- Frontmatter malformado → warning, prompt ignorado.
- `inputs[].name` vacío/duplicado dentro del mismo prompt → warning, prompt ignorado.
- `inputs[].kind` desconocido → warning, prompt ignorado.
- `{{var}}` en el cuerpo sin entrada en `inputs` → warning, tratado como `kind: string, required: false` (D6).
- Input en `inputs` no referenciado en el cuerpo → warning (no bloquea).

### 4.3 Renderizado — `resolvePrompt(promptName, values)`

Nuevo método en `session-manager.ts`:

```ts
export function resolvePrompt(
  sessionId: string,
  promptName: string,
  values: Record<string, string>,
): { text: string }
```

1. Busca el prompt en el catálogo fusionado (shadowing aplicado).
2. Valida: inputs con `required: true` sin valor → error con mensaje enumerando los inputs faltantes.
3. Itera los inputs declarados:
   - Para cada input, resuelve el `render` según su `kind` y el valor en `values[name]`:
     - `kind: string` (sin `enumValues`) → el valor tal cual.
     - `kind: string` + `enumValues` → el valor elegido (debe estar en `enumValues`).
     - `kind: session` → busca la sesión en el `sessions` Map según `render`:
       - `reference`: `[label](session:id)` (si no hay label, `[sessionId](session:sessionId)`)
       - `summary`: primeras ~500 palabras de los mensajes de la sesión, truncados
       - `id`: el sessionId como texto
       - `label`: el título/descripción de la sesión
     - `kind: path` → lee del filesystem según `render`:
       - `reference`: `[relPath](file:relPath)` (convención existente)
       - `contents`: ```` ```lang\n<contenido>\n``` ```` (lenguaje inferido de la extensión)
       - `path`: `relPath` como texto
     - `kind: prompt` → resuelve recursivamente. Profundidad máxima: 3; detección de ciclo con hash de nombres visitados.
4. Sustituye todos los `{{var}}` en el cuerpo por sus valores renderizados.
5. Elimina líneas que quedaron vacías tras la sustitución (inputs opcionales no rellenados).
6. Devuelve el texto final.

### 4.4 RPC methods — `transports/http.ts`

Dos nuevos casos en el switch de `handleRpc`:

```ts
case "getSessionPrompts": {
  const { sessionId } = params as { sessionId: string };
  result = { prompts: getSessionPrompts(sessionId) };
  break;
}
case "resolvePrompt": {
  const { sessionId, promptName, values } = params as {
    sessionId: string;
    promptName: string;
    values: Record<string, string>;
  };
  result = resolvePrompt(sessionId, promptName, values);
  break;
}
```

`getSessionPrompts` devuelve:
```ts
interface PromptSummary {
  name: string;
  description: string;
  inputs: PromptInput[]; // con kind, description, required, default, enumValues, placeholder, render, basePath
}
```

Los inputs se serializan completos para que el frontend construya el form sin volver a preguntar. El catálogo es estable durante la vida de la sesión Pi.

### 4.5 Sin cambios (explícito)

- `expandLeadingSkillCommands` — intacto; los prompts no usan el prefijo `/skill:`.
- `PiToAguiTranslator` — intacto; los prompts se resuelven antes de llegar a Pi (en el frontend) y Pi solo ve el texto ya renderizado.
- `convertPiMessagesToAgui` — intacto.
- System prompt de Pi — intacto; los prompts nunca se inyectan en él.
- Mecanismo de skills (`resourceLoader.getSkills()`) — intacto; `loadPrompts` es independiente.

## 5. Cambios en `packages/chatbot`

### 5.1 SkillsControl → control tabbed — `components/code/skills-control.tsx`

El componente actual se refactoriza para soportar tabs internamente:

```tsx
interface SkillsControlProps {
  // Existente
  skills: CodingAgentSkill[];
  selectedSkills: string[];
  onToggle: (name: string) => void;
  isLoading?: boolean;
  error?: string | null;

  // Nuevo
  prompts: PromptSummary[];
  isLoadingPrompts?: boolean;
  promptsError?: string | null;
  onPromptSelect: (promptName: string) => void;
}
```

Comportamiento:
- El `Dropdown.Popup` gana dos pestañas en la cabecera: **"Skills"** y **"Prompts"** (control de tabs con `aria-selected`).
- Tab "Skills": mismo contenido que hoy (lista de skills con checkboxes).
- Tab "Prompts": lista de prompts con `name` y `description`. Al hacer clic en uno → `onPromptSelect(promptName)` y se cierra el dropdown.
- El `ChatControl` (Puzzle) se ilumina si hay skills seleccionadas **o** se usó un prompt en este turno.

### 5.2 Hook — `useCodingAgentPrompts`

```ts
// lib/features/code/hooks/use-coding-agent-prompts.ts
export function useCodingAgentPrompts(sessionId: string, enabled: boolean) {
  // fetch GET /api/agent/code/sessions/[sessionId]/prompts
  // devuelve { prompts, isLoading, error }
}
```

Idéntico en estructura a [`useCodingAgentSkills`](file:packages/chatbot/lib/features/code/hooks/use-coding-agent-skills.ts).

### 5.3 PromptFormModal — `components/code/prompt-form-modal.tsx` (nuevo)

Componente dialog/modal que se abre al seleccionar un prompt:

```tsx
interface PromptFormModalProps {
  prompt: PromptSummary;
  sessionId: string;
  open: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
}
```

Comportamiento:
1. Al abrirse, carga los valores por defecto (`default` de cada input).
2. Renderiza un campo por cada entrada en `inputs`:
   - `kind: string` sin `enumValues` → `<input type="text">` con description como label, placeholder, required.
   - `kind: string` + `enumValues` → `<select>` con las opciones de `enumValues`.
   - `kind: session` → `<select>` poblado vía RPC que lista sesiones del proyecto.
   - `kind: path` → file picker (tree plano de `basePath`, o lazy load al expandir carpetas).
   - `kind: prompt` → `<select>` con el catálogo de prompts (ya en el frontend).
3. Botón "Insertar" que:
   - Valida campos `required: true`.
   - Llama a `resolvePrompt(sessionId, promptName, values)` vía `WorkerClient`.
   - Error → muestra mensaje en el modal (no lo cierra).
   - Éxito → `onInsert(text)` y cierra el modal.
4. Botón "Cancelar" → cierra sin insertar.
5. Estado de carga mientras se resuelve (spinner en "Insertar").

### 5.4 Integración en AgentCodeChat — `components/code/agent-code-chat.tsx`

```tsx
const [promptModal, setPromptModal] = useState<PromptSummary | null>(null);
const { prompts, isLoading: isLoadingPrompts, error: promptsError } =
  useCodingAgentPrompts(sessionId, !isLoading);

const handlePromptSelect = (promptName: string) => {
  const prompt = prompts.find(p => p.name === promptName);
  if (prompt) setPromptModal(prompt);
};

const handlePromptInsert = (text: string) => {
  setInput(prev => prev ? `${prev}\n\n${text}` : text);
  setPromptModal(null);
};
```

Nota sobre la inserción en cursor: en v1 se inserta al final del textarea (precedido de `\n\n` si ya hay texto). Insertar en la posición exacta del cursor requiere exponer `selectionStart`/`selectionEnd` del `Textarea` — detalle de implementación post-v1.

### 5.5 WorkerClient — `lib/features/code/worker-client.ts`

```ts
async getSessionPrompts(params: { sessionId: string }): Promise<{ prompts: PromptSummary[] }> {
  return this.call("getSessionPrompts", params);
}

async resolvePrompt(params: {
  sessionId: string; promptName: string; values: Record<string, string>;
}): Promise<{ text: string }> {
  return this.call("resolvePrompt", params);
}
```

### 5.6 API routes

```
GET  /api/agent/code/sessions/[sessionId]/prompts         → getSessionPrompts
POST /api/agent/code/sessions/[sessionId]/prompts/resolve  → resolvePrompt
```

## 6. Flujo end-to-end

```
Usuario                          Frontend                              Worker
  │                                │                                     │
  │  Abre dropdown Puzzle          │                                     │
  │  Cambia a tab "Prompts"        │                                     │
  │  Hace clic en "Code Review"    │                                     │
  │ ──────────────────────────────►│                                     │
  │                                │  Abre PromptFormModal               │
  │                                │  (inputs del catálogo)              │
  │                                │                                     │
  │  Rellena form:                 │                                     │
  │  - target_session → dropdown   │──► GET sessions (o en memoria)      │
  │  - relevant_file → file picker │                                     │
  │  - focus_area → select ok      │                                     │
  │  - extra_context → "..."       │                                     │
  │                                │                                     │
  │  Pulsa "Insertar"              │                                     │
  │ ──────────────────────────────►│                                     │
  │                                │  POST /prompts/resolve             │
  │                                │  { promptName, values }            │
  │                                │───────────────────────────────────►│
  │                                │                                     │  Valida required
  │                                │                                     │  Resuelve session → summary
  │                                │                                     │  Lee file → contents
  │                                │                                     │  Sustituye {{var}}
  │                                │                                     │
  │                                │  { text: "# Code Review...\n..." }  │
  │                                │◄───────────────────────────────────│
  │                                │                                     │
  │                                │  setInput(prev + "\n\n" + text)     │
  │  Ve el texto en el textarea    │                                     │
  │  Lo edita, añade skills, envía │                                     │
  │ ──────────────────────────────►│  sendMessage(text)                 │
  │                                │───────────────────────────────────►│
  │                                │                                     │  Pi recibe el prompt normal
```

## 7. Testing

### Unit — worker (`packages/coding-agent`)

- **`loadPrompts()`**:
  - Parsea correctamente un `prompt.prompty` con todos los kinds.
  - Fusiona los tres niveles con shadowing correcto.
  - No inyecta prompts en el system prompt de Pi.
  - Rechaza frontmatter malformado (warning, prompt ignorado).
  - Warning para inputs declarados pero no usados en el cuerpo.
  - Warning para `{{var}}` sin entrada en `inputs` (inferido como `kind: string`).
- **`resolvePrompt()`**:
  - Renderiza `kind: string` tal cual.
  - Renderiza `kind: string` + `enumValues` con el valor elegido.
  - Renderiza `kind: session` con cada modo (`reference`, `summary`, `id`, `label`).
  - Renderiza `kind: path` con cada modo (`reference`, `contents`, `path`).
  - Renderiza `kind: prompt` con cada modo (`reference`, `body`, `name`).
  - Error para inputs `required: true` sin valor.
  - Elimina líneas vacías de inputs opcionales no rellenados.
  - Composición con anidamiento válido (profundidad 2).
  - Detección de ciclo en composición (A→B→A, límite de profundidad 3).

### Unit — chatbot (`packages/chatbot`)

- **`SkillsControl`**: renderiza ambas tabs; cambia entre ellas; lista prompts; llama `onPromptSelect`.
- **`PromptFormModal`**: renderiza el form correcto según `inputs`; valida required; llama a `resolvePrompt` y `onInsert`; muestra errores del backend.
- **`useCodingAgentPrompts`**: fetch correcto, estados loading/error/vacío.
- **`WorkerClient`**: `getSessionPrompts` y `resolvePrompt` serializan/deserializan correctamente.

### E2E manual

1. Crear un `.agents/prompts/test/prompt.prompty` en un proyecto.
2. Abrir el chat del coding agent, verificar que "Prompts" aparece en el dropdown Puzzle.
3. Seleccionar el prompt → ver el modal con los inputs correctos.
4. Rellenar y pulsar "Insertar" → verificar que el texto aparece en el textarea.
5. Editar el texto insertado, añadir skills, enviar → verificar que Pi lo procesa.
6. Probar inputs opcionales (dejar vacío un `required: false` → no debe aparecer en el texto final).
7. Probar composición: un prompt que referencia a otro.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Sesiones para `kind: session` no disponibles (proyecto vacío) | El `<select>` muestra "No sessions available". Si `required: true`, el botón "Insertar" se deshabilita. |
| Archivo en `kind: path` no existe al resolver | `resolvePrompt` devuelve error: "File not found: <path>". El modal muestra el error sin cerrarse. |
| Prompt compuesto con ciclo | Detección de ciclo en `resolvePrompt` (profundidad máxima + hash de nombres visitados). |
| Catálogo de prompts grande (>50) | Lista scrolleable en el dropdown. Búsqueda/filtro en v2. |
| File picker para `kind: path` con directorio grande | Carga lazy del tree al expandir carpetas. Para v1, flat `<select>` si el directorio es pequeño. |
| Resolver `kind: session` con `render: summary` requiere acceso a mensajes (potencialmente grandes) | Truncar a ~500 palabras. Suficiente para que el LLM decida si necesita más. |
| Prompty spec evoluciona y añade propiedades que entran en conflicto con nuestras extensiones | Nuestras extensiones usan nombres que no existen en el spec actual (`render`, `basePath`, `placeholder`) y kinds (`session`, `path`, `prompt`) que no colisionan con los kinds estándar. Si el spec adoptara alguno, migraríamos. |

## 9. Fuera de scope (futuro)

- **Prompt favoriting / historial personal**: el usuario guarda sus propias variantes de prompts. Requiere base de datos.
- **Vista previa en vivo en el modal**: a medida que el usuario rellena inputs, un panel muestra el texto resultante en tiempo real.
- **Búsqueda/filtro de prompts** en el dropdown.
- **File picker con tree completo**: mismo componente que el file browser actual pero en modo "selector simple".
- **Placeholders inline en el textarea como chips**: en lugar de resolver antes de insertar, mantener `{{var}}` como chips editables. Requiere editor enriquecido.
- **Más kinds**: `number`, `boolean`, `date`, `toggle`, `multi-select`.
- **Validación avanzada en frontmatter**: `pattern` (regex), `min`/`max`, `minLength`/`maxLength`.
- **Jinja2 completo** (condicionales, bucles): `{% if var %}...{% endif %}`.
- **Internacionalización de prompts**: descriptions en múltiples idiomas.
- **Hot-reload de prompts**: refrescar el catálogo sin reiniciar el worker si se añade/quita un `.prompty` durante la sesión.
- **Uso de secciones Prompty** como `model`, `outputs`, `tools` si los prompts se ejecutaran directamente en el futuro.

## 10. Notas de implementación

### Orden de trabajo recomendado

1. **Worker: `loadPrompts()`** — escanear `prompts/*/prompt.prompty` en los 3 niveles.
2. **Worker: `getSessionPrompts()` + RPC** — exponer el catálogo al frontend.
3. **Worker: `resolvePrompt()` + RPC** — motor de renderizado (sin `kind: prompt` en v1 para reducir alcance).
4. **Chatbot: `WorkerClient` + API routes** — métodos nuevos y rutas de API.
5. **Chatbot: `SkillsControl` tabbed** — refactor del dropdown con tabs.
6. **Chatbot: `useCodingAgentPrompts` hook** — carga del catálogo.
7. **Chatbot: `PromptFormModal`** — modal con form y llamada a resolve.
8. **Chatbot: Integración en `AgentCodeChat`** — cablear todo junto.
9. **Composición de prompts** — `kind: prompt` en `resolvePrompt`.

### Extensibilidad del formato

El frontmatter está diseñado para ser extensible hacia adelante, respetando el spec Prompty:
- Kinds nuevos → el `PromptFormModal` renderiza un fallback genérico (`<input type="text">`) si no reconoce el kind.
- Propiedades nuevas en `inputs[]` → se ignoran sin error (igual que Prompty).
- `render` nuevos para kinds existentes → el default es siempre seguro; los no reconocidos caen al default del kind.
- Secciones Prompty (`model`, `outputs`, `tools`) → se ignoran si están presentes, permitiendo que un `.prompty` diseñado para ejecución funcione también como template en nuestro sistema.
