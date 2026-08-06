# Select de sessions en inputs de prompts — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los inputs `kind: session` de los prompts reutilizables se rendericen como un `<select>` con las sessions con label del proyecto (en vez de texto libre), migrando `code-review-session` al tipo `session` y ajustando el color del tab activo en el selector de skills/prompts.

**Architecture:** El route `GET /api/agent/code/sessions/[sessionId]/prompts` (que ya conoce `userId` + `project` de la DB) añade `listSessions` y devuelve `{ prompts, sessions }` en una sola petición. El hook `useCodingAgentPrompts` propaga `sessions` hasta `PromptFormModal`, que renderiza un `<select>` para inputs con `kind: "session"` (o un hint si no hay sessions). El worker no cambia: `renderInputValue` ya renderiza `kind: session`.

**Tech Stack:** TypeScript, Next.js App Router, React, Drizzle ORM, Vitest + React Testing Library, prompty (YAML frontmatter).

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-08-06-prompt-session-select-design.md`.
- Todos los commits de IA deben incluir la línea `Co-Authored-By: Claude Sonnet 4.5 <noreply@example.com>`.
- Comandos de test (desde la raíz del repo, workspace pnpm):
  - Coding-agent: `pnpm --filter coding-agent exec vitest run tests/unit/<file>.test.ts`
  - Chatbot: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/<file>.test.tsx`
- Type check: `pnpm --filter coding-agent type:check` y `pnpm --filter chatbot type:check` (deben quedar en verde al final de cada task).
- Las sessions provienen de `listSessions({ userId, project })` (solo con `label`, ordenadas por `updatedAt` desc) — **no se modifica** `session-store.ts`.
- Tipo compartido: `SessionSummary { sessionId: string; label: string | null }` (definido en `packages/chatbot/lib/features/code/worker-client.ts`).
- El worker (`packages/coding-agent/src/prompts.ts`) **no cambia** en ningún task.
- La session actual puede no aparecer en el select si no tiene label (decisión aceptada); sin preselección ("Seleccionar…").

---

### Task 1: Migrar `code-review-session` a `kind: session`

**Files:**
- Modify: `packages/coding-agent/prompts/code-review/prompt.prompty`
- Test: `packages/coding-agent/tests/unit/load-prompts.test.ts`

**Interfaces:**
- Produces: prompt built-in `code-review-session` con input `target_session` de `kind: "session"` y sin `placeholder`. Los tests posteriores dependen de que el worker siga cargando este prompt con esos inputs.

- [ ] **Step 1: Write the failing test**

Añade este test al final del `describe("loadPrompts", ...)` en `packages/coding-agent/tests/unit/load-prompts.test.ts`:

```ts
it("builtin code-review-session declares target_session as kind session", () => {
  loadPrompts(projectDir);
  const prompts = getSessionPrompts("fake-session");
  const review = prompts.find((p) => p.name === "code-review-session");
  expect(review).toBeDefined();
  const target = review!.inputs.find((i) => i.name === "target_session");
  expect(target?.kind).toBe("session");
  expect(target?.placeholder).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter coding-agent exec vitest run tests/unit/load-prompts.test.ts`
Expected: FAIL — `expected "string" to be "session"` (hoy `target_session` es `kind: "string"` con `placeholder: "ej. s_abc123"`).

- [ ] **Step 3: Migrate the prompt**

En `packages/coding-agent/prompts/code-review/prompt.prompty`, cambia el input `target_session`:

```diff
   - name: target_session
-    kind: string
+    kind: session
     description: ID de la sesión a revisar
     required: true
-    placeholder: ej. s_abc123
```

El resto del frontmatter (`focus_area`, `extra_context`, body) no cambia. Sin `render` explícito → el default de `kind: session` es `reference`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter coding-agent exec vitest run tests/unit/load-prompts.test.ts`
Expected: PASS (3 tests). Luego `pnpm --filter coding-agent type:check` → Done.

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/prompts/code-review/prompt.prompty packages/coding-agent/tests/unit/load-prompts.test.ts
git commit -m "feat(coding-agent): declare target_session as session kind in code-review prompt

Co-Authored-By: Claude Sonnet 4.5 <noreply@example.com>"
```

---

### Task 2: `SessionSummary` type + el route de prompts devuelve sessions

**Files:**
- Modify: `packages/chatbot/lib/features/code/worker-client.ts` (tras `PromptSummary`, ~línea 30)
- Modify: `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/prompts/route.ts`
- Create: `packages/chatbot/tests/unit/agent-code/prompts-route.test.ts`

**Interfaces:**
- Produces: `SessionSummary { sessionId: string; label: string | null }` exportado desde `worker-client.ts`.
- Produces: el route GET devuelve `{ prompts: PromptSummary[]; sessions: SessionSummary[] }`; con session inexistente devuelve `{ prompts: [], sessions: [] }` con status 404. Los tasks 3 y 4 dependen de esta forma.

- [ ] **Step 1: Write the failing test**

Crea `packages/chatbot/tests/unit/agent-code/prompts-route.test.ts` (patrón de `model-route.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/features/auth/with-auth/handler", () => ({
  withAuth:
    <T>(handler: T) =>
    async (req: Request) =>
      (handler as never as (user: { id: string }, req: Request) => Promise<Response>)(
        { id: "user-1" },
        req,
      ),
}));

const mockState = vi.hoisted(() => ({
  dbSession: undefined as Record<string, unknown> | undefined,
  sessions: [] as { sessionId: string; label: string | null }[],
  prompts: [] as unknown[],
  rpcCalls: [] as unknown[],
}));

vi.mock("@/lib/features/code/session-store", () => ({
  getSession: vi.fn(async () => mockState.dbSession),
  listSessions: vi.fn(async () => mockState.sessions),
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async initializeSession(params: unknown) {
      mockState.rpcCalls.push(["initializeSession", params]);
    }
    async getSessionPrompts(params: unknown) {
      mockState.rpcCalls.push(["getSessionPrompts", params]);
      return { prompts: mockState.prompts };
    }
  },
}));

import { GET } from "@/app/(chat)/api/agent/code/sessions/[sessionId]/prompts/route";

function makeRequest() {
  return new Request("http://test/api/agent/code/sessions/s1/prompts");
}

beforeEach(() => {
  mockState.dbSession = { sessionId: "s1", project: "p", piSessionId: "pi-1" };
  mockState.sessions = [
    { sessionId: "s1", label: "Session A" },
    { sessionId: "s2", label: "Session B" },
  ];
  mockState.prompts = [{ name: "code-review-session" }];
  mockState.rpcCalls = [];
});

describe("GET /api/agent/code/sessions/[sessionId]/prompts", () => {
  it("returns prompts and the labeled sessions of the project", async () => {
    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      prompts: [{ name: "code-review-session" }],
      sessions: [
        { sessionId: "s1", label: "Session A" },
        { sessionId: "s2", label: "Session B" },
      ],
    });
  });

  it("initializes the worker session with the db project before listing prompts", async () => {
    await GET(makeRequest() as never);

    expect(mockState.rpcCalls[0]).toEqual([
      "initializeSession",
      { userId: "user-1", sessionId: "s1", project: "p", piSessionId: "pi-1" },
    ]);
  });

  it("returns empty lists with 404 when the session is not found", async () => {
    mockState.dbSession = undefined;

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ prompts: [], sessions: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/prompts-route.test.ts`
Expected: FAIL — `sessions` no está en la respuesta (el route hoy devuelve solo `{ prompts }`).

- [ ] **Step 3: Add the `SessionSummary` type**

En `packages/chatbot/lib/features/code/worker-client.ts`, justo después de la interfaz `PromptSummary`:

```ts
export interface SessionSummary {
  sessionId: string;
  label: string | null;
}
```

- [ ] **Step 4: Update the route**

En `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/prompts/route.ts`:

Import: cambia `import { getSession } from "@/lib/features/code/session-store";` por

```ts
import { getSession, listSessions } from "@/lib/features/code/session-store";
```

Handler GET completo:

```ts
export const GET = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ prompts: [], sessions: [] }, { status: 404 });
  }

  const client = new WorkerClient();
  await client.initializeSession({
    userId: user.id,
    sessionId,
    project: dbSession.project,
    piSessionId: dbSession.piSessionId ?? undefined,
  });
  const result = await client.getSessionPrompts({ sessionId });
  const sessions = await listSessions({
    userId: user.id,
    project: dbSession.project,
  });
  return Response.json({
    prompts: result.prompts,
    sessions: sessions.map((s) => ({ sessionId: s.sessionId, label: s.label })),
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/prompts-route.test.ts`
Expected: PASS (3 tests). Luego `pnpm --filter chatbot type:check` → Done.

- [ ] **Step 6: Commit**

```bash
git add packages/chatbot/lib/features/code/worker-client.ts "packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/prompts/route.ts" packages/chatbot/tests/unit/agent-code/prompts-route.test.ts
git commit -m "feat(chatbot): include project sessions in prompts API response

Co-Authored-By: Claude Sonnet 4.5 <noreply@example.com>"
```

---

### Task 3: `useCodingAgentPrompts` devuelve `sessions`

**Files:**
- Modify: `packages/chatbot/lib/features/code/hooks/use-coding-agent-prompts.ts`
- Create: `packages/chatbot/tests/unit/agent-code/use-coding-agent-prompts.test.tsx`

**Interfaces:**
- Consumes: respuesta del route de Task 2 `{ prompts, sessions }`.
- Produces: `useCodingAgentPrompts(sessionId: string, enabled: boolean)` → `{ prompts: PromptSummary[]; sessions: SessionSummary[]; isLoading: boolean; error: string | null }`. Task 5 consume `sessions`.

- [ ] **Step 1: Write the failing test**

Crea `packages/chatbot/tests/unit/agent-code/use-coding-agent-prompts.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCodingAgentPrompts } from "@/lib/features/code/hooks/use-coding-agent-prompts";
import type { PromptSummary, SessionSummary } from "@/lib/features/code/worker-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCodingAgentPrompts", () => {
  it("loads prompts and labeled sessions from the API", async () => {
    const prompts: PromptSummary[] = [
      { name: "code-review-session", description: "Review a session", inputs: [] },
    ];
    const sessions: SessionSummary[] = [{ sessionId: "s1", label: "Session A" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ prompts, sessions }),
      })),
    );

    const { result } = renderHook(() => useCodingAgentPrompts("s1", true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.prompts).toEqual(prompts);
    expect(result.current.sessions).toEqual(sessions);
    expect(result.current.error).toBeNull();
  });

  it("falls back to empty arrays and sets an error when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );

    const { result } = renderHook(() => useCodingAgentPrompts("s1", true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.prompts).toEqual([]);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.error).toBe("Prompts could not be loaded.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/use-coding-agent-prompts.test.tsx`
Expected: FAIL — `result.current.sessions` es `undefined` (el hook hoy no lo devuelve).

- [ ] **Step 3: Implement**

Reemplaza `packages/chatbot/lib/features/code/hooks/use-coding-agent-prompts.ts` por:

```ts
"use client";

import { useEffect, useState } from "react";
import type {
  PromptSummary,
  SessionSummary,
} from "@/lib/features/code/worker-client";

export function useCodingAgentPrompts(sessionId: string, enabled: boolean) {
  const [prompts, setPrompts] = useState<PromptSummary[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const load = async () => {
      try {
        const response = await fetch(
          `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/prompts`,
        );
        if (!response.ok) {
          throw new Error(`Failed to load prompts: ${response.status}`);
        }
        const data = (await response.json()) as {
          prompts?: PromptSummary[];
          sessions?: SessionSummary[];
        };
        if (!cancelled) {
          setPrompts(data.prompts ?? []);
          setSessions(data.sessions ?? []);
        }
      } catch {
        if (!cancelled) setError("Prompts could not be loaded.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionId, enabled]);

  return { prompts, sessions, isLoading, error };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/use-coding-agent-prompts.test.tsx`
Expected: PASS (2 tests). Luego `pnpm --filter chatbot type:check` → Done.

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/lib/features/code/hooks/use-coding-agent-prompts.ts packages/chatbot/tests/unit/agent-code/use-coding-agent-prompts.test.tsx
git commit -m "feat(chatbot): return sessions from useCodingAgentPrompts

Co-Authored-By: Claude Sonnet 4.5 <noreply@example.com>"
```

---

### Task 4: `PromptFormModal` renderiza `kind: session` como `<select>`

**Files:**
- Modify: `packages/chatbot/components/code/prompt-form-modal.tsx`
- Create: `packages/chatbot/tests/unit/agent-code/prompt-form-modal.test.tsx`

**Interfaces:**
- Consumes: `SessionSummary` (Task 2).
- Produces: `PromptFormModal` con nueva prop `sessions: SessionSummary[]`. Un input con `kind === "session"` se renderiza como `<select>` (value = `sessionId`, label = `label`), con opción vacía "Seleccionar…"; si `sessions` está vacío, muestra el hint "No hay sessions con label disponibles". Task 5 usa la prop `sessions`.

- [ ] **Step 1: Write the failing test**

Crea `packages/chatbot/tests/unit/agent-code/prompt-form-modal.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PromptFormModal } from "@/components/code/prompt-form-modal";
import type { PromptSummary, SessionSummary } from "@/lib/features/code/worker-client";

const promptWithSession: PromptSummary = {
  name: "review",
  description: "Review a session",
  inputs: [
    {
      name: "target_session",
      kind: "session",
      description: "Session",
      required: true,
    },
  ],
};

const sessions: SessionSummary[] = [
  { sessionId: "s1", label: "Session A" },
  { sessionId: "s2", label: "Session B" },
];

function renderModal(overrides: { sessions?: SessionSummary[]; onInsert?: () => void } = {}) {
  return render(
    <PromptFormModal
      prompt={promptWithSession}
      sessionId="current"
      sessions={overrides.sessions ?? sessions}
      open
      onClose={() => {}}
      onInsert={overrides.onInsert ?? (() => {})}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PromptFormModal session input", () => {
  it("renders a select with the labeled sessions for kind session inputs", () => {
    renderModal();

    const select = screen.getByLabelText(/Session/) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain("Session A");
    expect(labels).toContain("Session B");
    const emptyOption = select.options[0];
    expect(emptyOption!.value).toBe("");
  });

  it("shows a hint and disables submit when there are no labeled sessions", () => {
    renderModal({ sessions: [] });

    expect(screen.getByText("No hay sessions con label disponibles")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Insert" })).toBeDisabled();
  });

  it("submits the selected sessionId to the resolve API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: "resolved" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const onInsert = vi.fn();

    renderModal({ onInsert });

    const select = screen.getByLabelText(/Session/) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "s2" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert" }));

    await waitFor(() => expect(onInsert).toHaveBeenCalledWith("resolved"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agent/code/sessions/current/prompts/resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          promptName: "review",
          values: { target_session: "s2" },
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/prompt-form-modal.test.tsx`
Expected: FAIL — hoy `kind: session` cae en el `<input type="text">` (el test busca un `<select>`).

- [ ] **Step 3: Implement**

En `packages/chatbot/components/code/prompt-form-modal.tsx`:

1. Import del tipo: cambia

```ts
import type { PromptSummary, PromptInput } from "@/lib/features/code/worker-client";
```

por

```ts
import type { PromptSummary, PromptInput, SessionSummary } from "@/lib/features/code/worker-client";
```

2. En `PromptFormModalProps`, añade `sessions`:

```ts
interface PromptFormModalProps {
  prompt: PromptSummary;
  sessionId: string;
  sessions: SessionSummary[];
  open: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
}
```

3. En el destructure del componente, añade `sessions`:

```ts
export const PromptFormModal: React.FC<PromptFormModalProps> = ({
  prompt,
  sessionId,
  sessions,
  open,
  onClose,
  onInsert,
}) => {
```

4. Pasa `sessions` al field (el mapeo `{prompt.inputs.map(...)}`):

```tsx
{prompt.inputs.map((input) => (
  <PromptFormField
    key={input.name}
    input={input}
    value={values[input.name] ?? ""}
    sessions={sessions}
    onChange={(v) => handleChange(input.name, v)}
  />
))}
```

5. En `PromptFormFieldProps` añade `sessions` y la nueva rama **antes** del `<input type="text">` de fallback:

```tsx
interface PromptFormFieldProps {
  input: PromptInput;
  value: string;
  sessions: SessionSummary[];
  onChange: (value: string) => void;
}
```

```tsx
const PromptFormField: React.FC<PromptFormFieldProps> = ({ input, value, sessions, onChange }) => {
  if (input.kind === "string" && input.enumValues && input.enumValues.length > 0) {
    return (
      <label className="block">
        <span className="text-sm font-medium">
          {input.description}
          {input.required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
        <select value={value} onChange={(e) => onChange(e.target.value)} required={input.required}
          className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-800">
          <option value="">Select…</option>
          {input.enumValues.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </label>
    );
  }

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
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={input.required}
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-800"
          >
            <option value="">Seleccionar…</option>
            {sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </label>
    );
  }

  return (
    <label className="block">
      <span className="text-sm font-medium">
        {input.description}
        {input.required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={input.placeholder} required={input.required}
        className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-800" />
    </label>
  );
};
```

Nota: el botón "Insertar" queda deshabilitado con sessions vacías e input `required` porque `values[input.name]` permanece `""` (ya lo cubre `isSubmitDisabled`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/prompt-form-modal.test.tsx`
Expected: PASS (3 tests). Luego `pnpm --filter chatbot type:check` → Done.

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/components/code/prompt-form-modal.tsx packages/chatbot/tests/unit/agent-code/prompt-form-modal.test.tsx
git commit -m "feat(chatbot): render session inputs as a select in prompt form

Co-Authored-By: Claude Sonnet 4.5 <noreply@example.com>"
```

---

### Task 5: Pasar `sessions` desde `AgentCodeChat` al modal

**Files:**
- Modify: `packages/chatbot/components/code/agent-code-chat.tsx` (destructure del hook ~línea 72-77; `PromptFormModal` ~línea 244)
- Create: `packages/chatbot/tests/unit/agent-code/agent-code-chat-prompt-modal.test.tsx`

**Interfaces:**
- Consumes: `useCodingAgentPrompts` devolviendo `sessions` (Task 3) y prop `sessions` de `PromptFormModal` (Task 4).
- Produces: `AgentCodeChat` pasa `sessions={sessions}` al `PromptFormModal`.

- [ ] **Step 1: Write the failing test**

Crea `packages/chatbot/tests/unit/agent-code/agent-code-chat-prompt-modal.test.tsx` (patrón de `agent-code-chat-cancel.test.tsx`):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentCodeChat } from "@/components/code/agent-code-chat";

const mocks = vi.hoisted(() => ({
  promptsResult: {
    prompts: [
      {
        name: "review",
        description: "Review a session",
        inputs: [
          { name: "target_session", kind: "session", description: "Session", required: true },
        ],
      },
    ],
    sessions: [{ sessionId: "s1", label: "Session A" }],
    isLoading: false,
    error: null as string | null,
  },
}));

vi.mock("@/lib/features/code/hooks/use-coding-agent", () => ({
  useCodingAgent: () => ({
    messages: [],
    items: [],
    toolErrors: new Map(),
    turnFiles: new Map(),
    isRunning: false,
    isLoading: false,
    sendMessage: vi.fn(() => Promise.resolve()),
    status: { kind: "idle" },
    error: null,
    cancel: undefined as unknown as () => Promise<void>,
  }),
}));
vi.mock("@/lib/features/meta-prompt/hooks/use-prompt-refiner", () => ({
  usePromptRefiner: () => ({
    isLoadingRefinedPrompt: false,
    refinePrompt: vi.fn(),
    undo: vi.fn(),
    hasPreviousMessage: false,
  }),
}));
vi.mock("@/lib/features/code/hooks/use-coding-agent-skills", () => ({
  useCodingAgentSkills: () => ({ skills: [], isLoading: false, error: null }),
}));
vi.mock("@/lib/features/code/hooks/use-coding-agent-prompts", () => ({
  useCodingAgentPrompts: () => mocks.promptsResult,
}));
vi.mock("@/components/code/agent-conversation", () => ({
  AgentConversation: () => null,
}));
vi.mock("@/components/code/file-browser/file-browser-provider", () => ({
  useFileBrowser: () => ({
    state: { pendingComments: [] },
    actions: { clearComments: vi.fn() },
  }),
}));
vi.mock("@/components/code/file-browser/pending-comments-bar", () => ({
  PendingCommentsBar: () => null,
}));

// jsdom in this setup does not expose the CSS global the Textarea autosize
// effect probes.
vi.stubGlobal("CSS", { supports: () => true });

afterEach(() => cleanup());

describe("AgentCodeChat prompt modal", () => {
  it("passes the labeled sessions into the session select of the prompt form", async () => {
    render(<AgentCodeChat project="p" sessionId="s" modelId="m" />);

    // El popup del dropdown se abre vía startTransition: usar queries
    // async (findBy*) en lugar de getBy* para esperar el flush.
    fireEvent.click(screen.getByLabelText("Select skills"));
    fireEvent.click(await screen.findByRole("tab", { name: "Prompts" }));
    fireEvent.click(await screen.findByText("review"));

    const select = (await screen.findByLabelText(/Session/)) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(Array.from(select.options).map((o) => o.textContent)).toContain(
      "Session A",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/agent-code-chat-prompt-modal.test.tsx`
Expected: FAIL — el select existe pero sin la opción "Session A" (hoy `AgentCodeChat` no pasa `sessions`; el modal recibe `undefined` y muestra el hint).

- [ ] **Step 3: Implement**

En `packages/chatbot/components/code/agent-code-chat.tsx`:

1. Añade `sessions` al destructure del hook:

```diff
   const {
     prompts,
+    sessions,
     isLoading: isLoadingPrompts,
     error: promptsError,
   } = useCodingAgentPrompts(sessionId, !isLoading);
```

2. Pasa la prop al modal:

```diff
         <PromptFormModal
           prompt={promptModal}
           sessionId={sessionId}
+          sessions={sessions}
           open={!!promptModal}
           onClose={() => setPromptModal(null)}
           onInsert={handlePromptInsert}
         />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/agent-code-chat-prompt-modal.test.tsx`
Expected: PASS. Luego `pnpm --filter chatbot type:check` → Done.

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/components/code/agent-code-chat.tsx packages/chatbot/tests/unit/agent-code/agent-code-chat-prompt-modal.test.tsx
git commit -m "feat(chatbot): pass available sessions into prompt form modal

Co-Authored-By: Claude Sonnet 4.5 <noreply@example.com>"
```

---

### Task 6: Tab activo con el color de texto estándar

**Files:**
- Modify: `packages/chatbot/components/code/skills-control.tsx` (clases de los dos botones de tab)
- Create: `packages/chatbot/tests/unit/agent-code/skills-control.test.tsx`

**Interfaces:**
- Produces: en `SkillsControl`, el tab activo usa `border-foreground text-foreground` (antes `border-blue-600 text-blue-600`). No consume nada de tasks anteriores.

- [ ] **Step 1: Write the failing test**

Crea `packages/chatbot/tests/unit/agent-code/skills-control.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SkillsControl } from "@/components/code/skills-control";

afterEach(() => cleanup());

function renderControl() {
  return render(
    <SkillsControl
      skills={[{ name: "code-review", description: "Review code changes" }]}
      selectedSkills={[]}
      onToggle={vi.fn()}
      prompts={[]}
      onPromptSelect={vi.fn()}
    />,
  );
}

describe("SkillsControl tabs", () => {
  it("highlights the active tab with the standard foreground color", async () => {
    renderControl();
    fireEvent.click(screen.getByLabelText("Select skills"));

    // El popup se abre vía startTransition: findByRole espera el flush.
    const skillsTab = await screen.findByRole("tab", { name: "Skills" });
    const promptsTab = screen.getByRole("tab", { name: "Prompts" });

    expect(skillsTab.className).toContain("border-foreground");
    expect(skillsTab.className).toContain("text-foreground");
    expect(promptsTab.className).not.toContain("border-foreground");

    fireEvent.click(promptsTab);

    expect(promptsTab.className).toContain("border-foreground");
    expect(skillsTab.className).not.toContain("border-foreground");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/skills-control.test.tsx`
Expected: FAIL — el tab activo usa `border-blue-600 text-blue-600`.

- [ ] **Step 3: Implement**

En `packages/chatbot/components/code/skills-control.tsx`, en ambos botones de tab (Skills y Prompts):

```diff
                 activeTab === "skills"
-                  ? "border-blue-600 text-blue-600"
+                  ? "border-foreground text-foreground"
                   : "border-transparent text-zinc-600 hover:bg-secondary-accent-foreground",
```

```diff
                 activeTab === "prompts"
-                  ? "border-blue-600 text-blue-600"
+                  ? "border-foreground text-foreground"
                   : "border-transparent text-zinc-600 hover:bg-secondary-accent-foreground",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/skills-control.test.tsx`
Expected: PASS. Luego `pnpm --filter chatbot type:check` → Done.

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/components/code/skills-control.tsx packages/chatbot/tests/unit/agent-code/skills-control.test.tsx
git commit -m "style(chatbot): use standard foreground color for active tab

Co-Authored-By: Claude Sonnet 4.5 <noreply@example.com>"
```

---

## Verificación final (tras la última task)

Run todos los tests de los dos paquetes para confirmar que nada se rompe:

```bash
pnpm --filter coding-agent test:unit
pnpm --filter chatbot test:unit
```

Verificación manual (E2E):
1. Crear una sesión con label en el proyecto (o usar una existente).
2. Abrir el dropdown Puzzle → tab "Prompts" → seleccionar `code-review-session`.
3. `target_session` debe ser un `<select>` con las sessions con label del proyecto, sin preselección.
4. Seleccionar una session → "Insert" → el texto insertado contiene `[<sessionId>](session:<sessionId>)`.
5. Repetir con `test-all-kinds` (input `target_session` con `kind: session`) → mismo comportamiento.
6. Proyecto sin sessions con label: hint "No hay sessions con label disponibles" y "Insert" deshabilitado.
7. El tab activo (Skills/Prompts) se ve con el color de texto estándar, no azul.
