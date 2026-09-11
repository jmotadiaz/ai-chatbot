# Select de sessions en inputs de prompts — Diseño

**Fecha:** 2026-08-06
**Estado:** Propuesta (pendiente de revisión)
**Contexto:** Continuación del spec [2026-08-03-reusable-prompts-design.md](2026-08-03-reusable-prompts-design.md). El sistema de prompts reutilizables ya existe (catálogo de `.prompty` en 3 niveles, `PromptFormModal`, RPC `getSessionPrompts`/`resolvePrompt`). Este spec concreta el comportamiento de los inputs con `kind: session`: hoy el modal los renderiza como texto libre, cuando deben ser un `<select>` poblado con las sessions disponibles del proyecto.

## 1. Problema

Los inputs de tipo `session` en los prompts se renderizan en `PromptFormModal` como `<input type="text">` (texto libre). El usuario debe copiar/pegar manualmente el sessionId, con riesgo de errores (ids largos, typo, session inexistente). Además, el prompt built-in `code-review-session` ni siquiera usa `kind: session` — declara `target_session` como `kind: string` con placeholder, por lo que su intención (seleccionar una sesión del proyecto) no se refleja en el sistema de tipos ni en la UI.

## 2. Decisiones tomadas (con el usuario)

| # | Decisión | Elección |
|---|----------|----------|
| D1 | Alcance | **Comportamiento genérico**: cualquier input con `kind: session` se renderiza como `<select>` de sessions. No es un caso especial del prompt de code-review. |
| D2 | Migración del prompt built-in | `code-review-session` pasa `target_session` de `kind: string` a `kind: session` (se elimina el `placeholder`, que no aplica a un select). |
| D3 | Origen de las sessions | **DB del chatbot**: `listSessions({ userId, project })` — solo sessions **con label** del proyecto actual, ordenadas por `updatedAt` desc. Mismo filtrado que el sidebar existente. Si la session actual no tiene label, no aparece (no hay actividad que revisar) — aceptado explícitamente. |
| D4 | Flujo de datos | **Opción A — poblar desde el servidor**: el route `GET /api/agent/code/sessions/[sessionId]/prompts` (que ya conoce `user.id` + `project`) añade `listSessions` y devuelve `{ prompts, sessions }` en una sola petición. Descartada la opción de fetch en el cliente (segunda petición, requiere prop `project` en el modal) y la de un RPC del worker (el worker no tiene acceso a la DB del chatbot). |
| D5 | Preselección | Sin preselección: el select empieza vacío con "Seleccionar…", consistente con el select de `enumValues` existente. |
| D6 | Estado vacío | Si no hay sessions con label: hint "No hay sessions con label disponibles" y el botón "Insertar" queda deshabilitado si el input es `required` (lo cubre la lógica existente de `isSubmitDisabled`: el valor queda vacío). |
| D7 | Estilo del tab activo | En `SkillsControl`, el tab activo pasa de azul (`border-blue-600 text-blue-600`) al **color de texto estándar** del tema (`border-foreground text-foreground`). |

## 3. Arquitectura del flujo de datos

```
PromptFormModal (client)
      ▲
      │ sessions: SessionSummary[] (prop)
      │
AgentCodeChat ──► useCodingAgentPrompts(sessionId) ──► GET /api/agent/code/sessions/[sessionId]/prompts
      │                                                        │
      │                                                        ├─ getSession({ userId, sessionId })   → project (existente)
      │                                                        ├─ client.getSessionPrompts()          → { prompts } (existente, worker RPC)
      │                                                        └─ listSessions({ userId, project })   → sessions con label (nuevo)
      │                                                        │
      └──────────────────────────  { prompts, sessions } ◄─────┘
```

El worker no cambia: `renderInputValue` ya renderiza `kind: session` (`[id](session:id)` por defecto). El route es el único punto que fusiona prompts (worker) con sessions (DB).

## 4. Cambios por archivo

### 4.1 `packages/coding-agent/prompts/code-review/prompt.prompty`

```diff
   - name: target_session
-    kind: string
+    kind: session
     description: ID de la sesión a revisar
     required: true
-    placeholder: ej. s_abc123
```

Sin `render` explícito → se usa el default (`reference`), que renderiza `[sessionId](session:sessionId)`. El resto del prompt (inputs `focus_area`, `extra_context`) no cambia.

### 4.2 `packages/chatbot/lib/features/code/worker-client.ts`

Nuevo tipo junto a `PromptInput`/`PromptSummary`:

```ts
export interface SessionSummary {
  sessionId: string;
  label: string | null;
}
```

Shape mínimo: no se exponen `userId`, `project`, `piSessionId`, `updatedAt`, etc.

### 4.3 `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/prompts/route.ts`

Después de obtener `dbSession` (ya existente):

```ts
const sessions = await listSessions({ userId: user.id, project: dbSession.project });
const result = await client.getSessionPrompts({ sessionId });
return Response.json({
  prompts: result.prompts,
  sessions: sessions.map((s) => ({ sessionId: s.sessionId, label: s.label })),
});
```

`session-store.ts` no cambia (se reutiliza `listSessions` tal cual).

### 4.4 `packages/chatbot/lib/features/code/hooks/use-coding-agent-prompts.ts`

- Nuevo estado `sessions: SessionSummary[]`.
- Se parsea de la respuesta `{ prompts, sessions }`.
- Se devuelve: `{ prompts, sessions, isLoading, error }`.

### 4.5 `packages/chatbot/components/code/prompt-form-modal.tsx`

- Nueva prop `sessions: SessionSummary[]`.
- En `PromptFormField`, nueva rama para `input.kind === "session"` (antes de la rama de texto libre):

```tsx
if (input.kind === "session") {
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {input.description}
        {input.required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {sessions.length === 0 ? (
        <span className="mt-1 block text-sm text-muted-foreground">
          No hay sessions con label disponibles
        </span>
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} required={input.required}
          className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-800">
          <option value="">Seleccionar…</option>
          {sessions.map((s) => (
            <option key={s.sessionId} value={s.sessionId}>{s.label}</option>
          ))}
        </select>
      )}
    </label>
  );
}
```

El valor enviado a `resolvePrompt` es el `sessionId` (ya es lo que el worker espera para `kind: session`).

### 4.6 `packages/chatbot/components/code/agent-code-chat.tsx`

- `const { prompts, sessions, ... } = useCodingAgentPrompts(...)`.
- Pasar `sessions={sessions}` al `PromptFormModal`.

### 4.7 `packages/chatbot/components/code/skills-control.tsx`

En ambos tabs (Skills y Prompts), la clase del tab activo:

```diff
- activeTab === "skills" ? "border-blue-600 text-blue-600" : ...
- activeTab === "prompts" ? "border-blue-600 text-blue-600" : ...
+ activeTab === "skills" ? "border-foreground text-foreground" : ...
+ activeTab === "prompts" ? "border-foreground text-foreground" : ...
```

## 5. Casos borde y errores

- **Sin sessions con label**: hint en lugar del select; `required` → submit deshabilitado (el valor queda vacío, lo cubre `isSubmitDisabled`).
- **Session no perteneciente al usuario**: no aparece en el select; imposible seleccionarla desde la UI. El worker no valida pertenencia (fuera de scope).
- **`kind: session` con `render: summary`**: sin cambios en el worker (sigue siendo stub que renderiza la referencia). Solo cambia el widget del form.
- **Select vacío en "Seleccionar…"**: el valor es `""`, el render en el worker devuelve cadena vacía para ese input → la línea se elimina (comportamiento existente).

## 6. Testing

- **`packages/coding-agent/tests/unit/load-prompts.test.ts`**: no cambia — solo verifica la presencia del nombre `code-review-session`, no sus inputs. Verificar que sigue en verde tras la migración.
- **Manual (chatbot)**:
  1. Crear una sesión con label en el proyecto (o usar una existente).
  2. Abrir el dropdown Puzzle → tab "Prompts" → seleccionar `code-review-session`.
  3. Verificar que `target_session` es un `<select>` con las sessions con label del proyecto, sin preselección.
  4. Seleccionar una session → "Insertar" → el texto contiene `[<sessionId>](session:<sessionId>)`.
  5. Repetir con `test-all-kinds` (input `target_session` con `kind: session`) → mismo comportamiento.
  6. Verificar el tab activo con el color de texto estándar en lugar de azul.
  7. Con un proyecto sin sessions con label: hint visible y submit deshabilitado.

## 7. Fuera de scope

- Validación server-side de que la session pertenece al usuario (el select ya lo garantiza en la UI).
- Preselección de la session actual (descartada en D5).
- `render: summary` real en el worker (stub existente, sin cambios aquí).
- Sessions sin label en el select (D3).
