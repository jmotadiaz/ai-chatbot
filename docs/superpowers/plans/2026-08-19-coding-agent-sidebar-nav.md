# Coding Agent como sección del sidebar — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover la navegación del coding agent al sidebar como sección "Coding Agent" (lista de proyectos con colapsables excluyentes de sesiones, límite 10, highlight de ruta actual) y eliminar la landing `/agent/code`.

**Architecture:** Un componente cliente nuevo `AgentCodeSection` recibe la lista de proyectos por props (fetcheada server-side en la `Sidebar`, igual que la sección Projects), lazy-carga las sesiones de cada proyecto al expandir vía la server action `getCodingAgentSessions(project, limit)` y deriva el proyecto/sesión de la ruta actual con `usePathname()`. Se eliminan la página `/agent/code`, el explorador y el enlace del sidebar. El límite de 10 se aplica en el SQL de `listSessions`.

**Tech Stack:** TypeScript, Next.js App Router, React 19, react-collapsed 4, Drizzle ORM, Vitest + React Testing Library, Playwright.

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-08-19-coding-agent-sidebar-nav-design.md`.
- Todos los commits de IA deben incluir la línea `Co-Authored-By: Claude <noreply@anthropic.com>` (según AGENTS.md del repo).
- Node.js 24 + pnpm 11 (workspace). Todo el trabajo de este plan vive en `packages/chatbot`.
- Comandos (desde la raíz del repo):
  - Tests unit/component/integración de un archivo: `pnpm --filter chatbot exec vitest run tests/<carpeta>/<archivo>` (los de componente necesitan el comentario `/** @vitest-environment jsdom */` en el archivo).
  - Integración: requiere el postgres de test: `pnpm db:test:start` (docker compose test) antes de correr.
  - Type check: `pnpm --filter chatbot type:check` — debe quedar en verde al final de cada task.
  - Lint: `pnpm --filter chatbot lint`
  - E2E: `pnpm --filter chatbot exec playwright test tests/e2e/agent-code/` (arranca su propio webServer con `NEXT_PUBLIC_ENV=test`).
- En entorno de test (`NEXT_PUBLIC_ENV === "test"`), `getCodingAgentProjects()` devuelve `["ai-chatbot"]` (mock ya existente en `lib/features/code/actions.ts`).
- `listSessions` sigue filtrando sesiones sin label (`isNotNull(label)`) y ordenando por `updatedAt` desc — no se cambia eso.

---

## File Structure

- **Modify** `packages/chatbot/lib/features/code/session-store.ts:45-58` — `listSessions` gana `limit?: number` (SQL `LIMIT`).
- **Modify** `packages/chatbot/lib/features/code/actions.ts:81-89` — `getCodingAgentSessions(project, limit?)` propaga el límite.
- **Create** `packages/chatbot/components/layout/sidebar/agent-code-section.tsx` — la sección cliente (proyectos + collapsibles de sesiones + `+` + highlight + auto-expand).
- **Modify** `packages/chatbot/components/layout/sidebar/sidebar.tsx` — renderiza la sección (con Suspense + skeleton) donde estaba el enlace.
- **Delete** `packages/chatbot/components/layout/sidebar/agent-code-nav.tsx`.
- **Delete** `packages/chatbot/components/code/coding-agent-explorer.tsx`.
- **Delete** `packages/chatbot/app/(chat)/agent/code/page.tsx` (la ruta `/agent/code` pasa a 404 natural).
- **Create** `packages/chatbot/tests/component/agent-code/agent-code-section.test.tsx`.
- **Modify** `packages/chatbot/tests/integration/agent-code/session-store.test.ts` — tests del límite.
- **Modify** `packages/chatbot/tests/e2e/agent-code/agent-code.spec.ts`, `reconnect.spec.ts`, `tool-call-grouping.spec.ts` — crear sesión vía la sección del sidebar; verificar 404 de `/agent/code`.

---

### Task 1: Límite de sesiones en el listado (store + action)

**Files:**
- Modify: `packages/chatbot/lib/features/code/session-store.ts:45-58` (`listSessions`)
- Modify: `packages/chatbot/lib/features/code/actions.ts:81-89` (`getCodingAgentSessions`)
- Test: `packages/chatbot/tests/integration/agent-code/session-store.test.ts`

**Interfaces:**
- Produces: `listSessions(input: { userId: string; project: string; limit?: number })` — con `limit` definido aplica SQL `.limit(limit)`; sin `limit` devuelve todas. `getCodingAgentSessions(project: string, limit?: number)` propaga el parámetro (la Task 2 la llama con `limit = 10`).

- [ ] **Step 1: Write the failing tests**

Añade al final del `describe("session-store", ...)` en `packages/chatbot/tests/integration/agent-code/session-store.test.ts`:

```ts
it("lists at most N sessions when a limit is given", async () => {
  await seedUser();
  for (let i = 0; i < 12; i++) {
    await createSession({
      userId,
      project,
      modelId: "Deepseek v4 Pro",
      label: `Session ${String(i).padStart(2, "0")}`,
    });
  }
  const sessions = await listSessions({ userId, project, limit: 10 });
  expect(sessions).toHaveLength(10);
});

it("returns all sessions when no limit is given", async () => {
  await seedUser();
  for (let i = 0; i < 12; i++) {
    await createSession({
      userId,
      project,
      modelId: "Deepseek v4 Pro",
      label: `Session ${String(i).padStart(2, "0")}`,
    });
  }
  const sessions = await listSessions({ userId, project });
  expect(sessions).toHaveLength(12);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm db:test:start && pnpm --filter chatbot exec vitest run tests/integration/agent-code/session-store.test.ts`
Expected: el caso `limit: 10` FAIL — `listSessions` ignora el límite y devuelve las 12, `expected 10, received 12`.

- [ ] **Step 3: Implement the limit**

En `packages/chatbot/lib/features/code/session-store.ts`, cambia la firma y el cuerpo de `listSessions` (mantenlo como único `select()...orderBy()`):

```ts
export async function listSessions(input: {
  userId: string;
  project: string;
  limit?: number;
}) {
  const query = getDb()
    .select()
    .from(codingAgentSessions)
    .where(
      and(
        eq(codingAgentSessions.userId, input.userId),
        eq(codingAgentSessions.project, input.project),
        isNotNull(codingAgentSessions.label),
      ),
    )
    .orderBy(desc(codingAgentSessions.updatedAt));
  if (input.limit !== undefined) {
    query.limit(input.limit);
  }
  return query;
}
```

Nota: `getDb()` devuelve un query builder tipado de Drizzle; `query.limit(n)` solo se ejecuta cuando se resuelve la promesa del `select()`. El `return query` resuelve la consulta con el `LIMIT` ya aplicado.

En `packages/chatbot/lib/features/code/actions.ts`, actualiza `getCodingAgentSessions` para aceptar y propagar el límite:

```ts
export async function getCodingAgentSessions(project: string, limit?: number) {
  return withActionTrace("getCodingAgentSessions", async (log) => {
    assertEnabled();
    const userId = await getUserId();
    const result = await listSessions({ userId, project, limit });
    log.info("action.result", { count: result.length });
    return result;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter chatbot exec vitest run tests/integration/agent-code/session-store.test.ts`
Expected: PASS (4 tests originales + 2 nuevos).

- [ ] **Step 5: Type check y commit**

Run: `pnpm --filter chatbot type:check`
Expected: sin errores.

```bash
git add packages/chatbot/lib/features/code/session-store.ts packages/chatbot/lib/features/code/actions.ts packages/chatbot/tests/integration/agent-code/session-store.test.ts
git commit -m "feat(agent-code): limit sessions listing to N most recent

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Sección "Coding Agent" en el sidebar (componente + tests)

**Files:**
- Create: `packages/chatbot/components/layout/sidebar/agent-code-section.tsx`
- Test: `packages/chatbot/tests/component/agent-code/agent-code-section.test.tsx`

**Interfaces:**
- Consumes: `getCodingAgentSessions(project: string, limit?: number): Promise<Array<{ id: string; sessionId: string; label: string | null; updatedAt: Date }>>` (Task 1), `createCodingAgentSession(project: string): Promise<{ sessionId: string }>` (existente).
- Produces: `AgentCodeSection` (props: `{ projects: string[] }`) y `AgentCodeSectionLoading` (sin props) — la Task 3 las importa de `@/components/layout/sidebar/agent-code-section`.

- [ ] **Step 1: Write the failing tests**

Crea `packages/chatbot/tests/component/agent-code/agent-code-section.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { AgentCodeSection } from "@/components/layout/sidebar/agent-code-section";

// react-collapsed observa tamaño con ResizeObserver (no existe en jsdom).
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const mocks = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
  sessions: vi.fn(),
  create: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/features/code/actions", () => ({
  getCodingAgentSessions: (project: string, limit?: number) =>
    mocks.sessions(project, limit),
  createCodingAgentSession: (project: string) => mocks.create(project),
}));

const session = (i: number) => ({
  id: `id-${i}`,
  sessionId: `session-${i}`,
  label: `Label ${i}`,
  updatedAt: new Date(),
});

// react-collapsed pide aria-controls a un id estable; se lo pasamos con data-id
const projectItem = (name: string) =>
  document.querySelector(
    `[data-testid="agent-project-item"][aria-label="${name}"]`,
  );

describe("AgentCodeSection", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.pathname = "/";
  });

  it("renders every project from props", () => {
    render(<AgentCodeSection projects={["alpha", "beta"]} />);
    expect(projectItem("alpha")).not.toBeNull();
    expect(projectItem("beta")).not.toBeNull();
  });

  it("lazy-loads the sessions of an expanded project with limit 10", async () => {
    mocks.sessions.mockResolvedValue([session(1), session(2)]);
    mocks.pathname = "/chat/abc";
    const { getByRole } = render(
      <AgentCodeSection projects={["alpha", "beta"]} />,
    );

    fireEvent.click(getByRole("button", { name: "alpha" }));

    await waitFor(() => expect(mocks.sessions).toHaveBeenCalledWith("alpha", 10));
    // Los links de sesión apuntan a la ruta del proyecto.
    expect(
      document.querySelector('[data-testid="agent-session-link"][href="/agent/code/alpha/session-1"]'),
    ).not.toBeNull();
  });

  it("keeps only one project open at a time (exclusivity)", async () => {
    mocks.sessions.mockResolvedValue([]);
    const { getByRole } = render(
      <AgentCodeSection projects={["alpha", "beta"]} />,
    );

    fireEvent.click(getByRole("button", { name: "alpha" }));
    fireEvent.click(getByRole("button", { name: "beta" }));

    const alpha = getByRole("button", { name: "alpha" });
    const beta = getByRole("button", { name: "beta" });
    await waitFor(() => expect(beta.getAttribute("aria-expanded")).toBe("true"));
    expect(alpha.getAttribute("aria-expanded")).toBe("false");
    expect(mocks.sessions).toHaveBeenCalledTimes(2);
  });

  it("highlights the project and session of the current route", async () => {
    mocks.sessions.mockResolvedValue([session(1), session(2)]);
    mocks.pathname = "/agent/code/alpha/session-1";
    render(<AgentCodeSection projects={["alpha", "beta"]} />);

    await waitFor(() =>
      expect(mocks.sessions).toHaveBeenCalledWith("alpha", 10),
    );
    const projectRow = window.document.querySelector(
      '[data-testid="agent-project-item"][aria-label="alpha"]',
    );
    expect(projectRow?.className).toContain("bg-gray-200");

    const activeLink = window.document.querySelector(
      '[data-testid="agent-session-link"][href="/agent/code/alpha/session-1"]',
    );
    expect(activeLink?.closest(".bg-gray-200")).not.toBeNull();
  });

  it("renders the label or falls back to the session id", async () => {
    mocks.sessions.mockResolvedValue([{ ...session(1), label: null }]);
    render(<AgentCodeSection projects={["alpha"]} />);
    fireEvent.click(document.querySelector('[aria-label="alpha"]')!);

    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="agent-session-link"]')?.textContent,
      ).toContain("session-1");
    });
  });

  it("creates a session and navigates on the + button", async () => {
    mocks.create.mockResolvedValue({ sessionId: "brand-new" });
    render(<AgentCodeSection projects={["alpha"]} />);

    fireEvent.click(
      document.querySelector('[data-testid="agent-new-session"]')!,
    );

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith("alpha"));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/agent/code/alpha/brand-new",
      ),
    );
  });

  it("auto-expands the project of the route on mount and on navigation", async () => {
    mocks.sessions.mockResolvedValue([]);
    mocks.pathname = "/agent/code/beta/session-9";
    const { rerender } = render(
      <AgentCodeSection projects={["alpha", "beta"]} />,
    );

    await waitFor(() =>
      expect(mocks.sessions).toHaveBeenCalledWith("beta", 10),
    );

    // Navegación a otra sesión (cambio de pathname) → manda la ruta.
    mocks.sessions.mockClear();
    mocks.pathname = "/agent/code/alpha/session-3";
    rerender(<AgentCodeSection projects={["alpha", "beta"]} />);

    await waitFor(() =>
      expect(mocks.sessions).toHaveBeenCalledWith("alpha", 10),
    );
  });

  it("shows the empty and loading states", async () => {
    mocks.sessions.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([]), 50);
        }),
    );
    render(<AgentCodeSection projects={["alpha"]} />);

    fireEvent.click(document.querySelector('[aria-label="alpha"]')!);
    await waitFor(() =>
      expect(document.body.textContent).toContain("Loading sessions"),
    );

    await waitFor(() =>
      expect(document.body.textContent).toContain("No sessions yet"),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter chatbot exec vitest run tests/component/agent-code/agent-code-section.test.tsx`
Expected: FAIL — el módulo `@/components/layout/sidebar/agent-code-section` no existe (import error).

- [ ] **Step 3: Implement the component**

Crea `packages/chatbot/components/layout/sidebar/agent-code-section.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCollapse } from "react-collapsed";
import { ChevronDown, CodeXml, Plus } from "lucide-react";
import type { ClassNameValue } from "tailwind-merge";
import { cn } from "@/lib/utils/helpers";
import { Item } from "@/components/ui/item";
import ChatLink from "@/components/chat/link";
import { SidebarSectionTitle } from "@/components/layout/sidebar/section-title";
import {
  createCodingAgentSession,
  getCodingAgentSessions,
} from "@/lib/features/code/actions";

export interface CodingAgentSession {
  id: string;
  sessionId: string;
  label: string | null;
  updatedAt: Date;
}

export const SESSIONS_LIMIT = 10;

const AGENT_ROUTE = /^\/agent\/code\/([^/]+)\/([^/]+)/;

function parseAgentRoute(
  pathname: string,
): { project: string; sessionId: string } | null {
  const match = pathname.match(AGENT_ROUTE);
  if (!match) return null;
  return { project: decodeURIComponent(match[1]), sessionId: match[2] };
}

export interface AgentCodeSectionProps {
  projects: string[];
}

export const AgentCodeSection: React.FC<AgentCodeSectionProps> = ({
  projects,
}) => {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [sessionsMap, setSessionsMap] = useState<
    Record<string, CodingAgentSession[]>
  >({});
  const [loadingProject, setLoadingProject] = useState<string | null>(null);
  const [errorProject, setErrorProject] = useState<string | null>(null);

  const current = parseAgentRoute(pathname);

  // La ruta manda: al montar o navegar a una sesión se abre su proyecto.
  useEffect(() => {
    if (current) {
      setOpenProject(current.project);
    }
  }, [current?.project]);

  const loadSessions = async (project: string) => {
    setLoadingProject(project);
    setErrorProject(null);
    try {
      const sessions = await getCodingAgentSessions(project, SESSIONS_LIMIT);
      setSessionsMap((prev) => ({ ...prev, [project]: sessions }));
    } catch {
      setErrorProject(project);
    } finally {
      setLoadingProject(null);
    }
  };

  const handleToggle = (project: string) => {
    if (openProject === project) {
      setOpenProject(null);
      return;
    }
    setOpenProject(project);
    if (!sessionsMap[project] && loadingProject !== project) {
      void loadSessions(project);
    }
  };

  const handleNewSession = (project: string) => {
    void (async () => {
      const session = await createCodingAgentSession(project);
      router.push(
        `/agent/code/${encodeURIComponent(project)}/${session.sessionId}`,
      );
    })();
  };

  return (
    <div className="my-4">
      <SidebarSectionTitle>
        <CodeXml size={14} className="mr-1" /> Coding Agent
      </SidebarSectionTitle>
      <div role="list" className="space-y-1">
        {projects.map((project) => (
          <ProjectRow
            key={project}
            project={project}
            isOpen={openProject === project}
            active={current?.project === project}
            currentSessionId={current?.project === project ? current.sessionId : undefined}
            sessions={sessionsMap[project]}
            loading={loadingProject === project}
            error={errorProject === project}
            onToggle={() => handleToggle(project)}
            onNewSession={() => handleNewSession(project)}
          />
        ))}
      </div>
    </div>
  );
};

interface ProjectRowProps {
  project: string;
  isOpen: boolean;
  active: boolean;
  currentSessionId?: string;
  sessions?: CodingAgentSession[];
  loading: boolean;
  error: boolean;
  onToggle: () => void;
  onNewSession: () => void;
}

const ProjectRow: React.FC<ProjectRowProps> = ({
  project,
  isOpen,
  active,
  currentSessionId,
  sessions,
  loading,
  error,
  onToggle,
  onNewSession,
}) => {
  const { getCollapseProps, getToggleProps } = useCollapse({
    isExpanded: isOpen,
    onToggle,
  });

  return (
    <div className="flex flex-col gap-2">
      <Item
        className="cursor-pointer"
        aria-label={project}
        data-testid="agent-project-item"
        active={active}
        {...getToggleProps()}
      >
        <span className="flex-1 truncate">{project}</span>
        <button
          type="button"
          aria-label={`New session in ${project}`}
          data-testid="agent-new-session"
          className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-600 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onNewSession();
          }}
        >
          <Plus size={16} />
        </button>
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform duration-300",
            isOpen && "rotate-180",
          )}
        />
      </Item>
      <div {...getCollapseProps()}>
        <div className="flex flex-col ml-2 pl-4 my-2 border-l-2 border-zinc-300 dark:border-zinc-600">
          {loading ? (
            <div className="text-xs text-muted-foreground py-1">
              Loading sessions...
            </div>
          ) : error ? (
            <div className="text-xs text-red-500 py-1">
              No se pudieron cargar las sesiones.
            </div>
          ) : sessions ? (
            sessions.length === 0 ? (
              <div className="text-xs text-muted-foreground py-1">
                No sessions yet
              </div>
            ) : (
              sessions.map((session) => (
                <Item
                  key={session.id}
                  className="py-0"
                  active={session.sessionId === currentSessionId}
                >
                  <ChatLink
                    href={`/agent/code/${encodeURIComponent(project)}/${encodeURIComponent(session.sessionId)}`}
                    data-testid="agent-session-link"
                    className="flex-1 py-2 overflow-hidden"
                  >
                    <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                      {session.label ?? session.sessionId}
                    </span>
                  </ChatLink>
                </Item>
              ))
            )
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const AgentCodeSectionLoading: React.FC<{
  className?: ClassNameValue;
}> = ({ className }) => {
  return (
    <div className={cn("my-4", className)}>
      <div className="text-base flex items-center font-semibold text-zinc-500 dark:text-zinc-300 mb-4">
        <CodeXml size={18} className="mr-2" /> Coding Agent
      </div>
      <div className="space-y-1">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex">
            <div className="h-5 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse flex-1 mr-3" />
            <div className="h-4 w-4 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter chatbot exec vitest run tests/component/agent-code/agent-code-section.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Type check, lint y commit**

Run: `pnpm --filter chatbot type:check && pnpm --filter chatbot lint`
Expected: sin errores (si lint se queja de la dependencia del efecto, ajustar con el comentario `// eslint-disable-next-line` acorde).

```bash
git add packages/chatbot/components/layout/sidebar/agent-code-section.tsx packages/chatbot/tests/component/agent-code/agent-code-section.test.tsx
git commit -m "feat(agent-code): coding agent sidebar section with exclusive project collapsibles

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Integrar en la Sidebar y eliminar la landing

**Files:**
- Modify: `packages/chatbot/components/layout/sidebar/sidebar.tsx` (imports + render de la sección)
- Delete: `packages/chatbot/components/layout/sidebar/agent-code-nav.tsx`
- Delete: `packages/chatbot/components/code/coding-agent-explorer.tsx`
- Delete: `packages/chatbot/app/(chat)/agent/code/page.tsx`

**Interfaces:**
- Consumes: `AgentCodeSection` / `AgentCodeSectionLoading` de `@/components/layout/sidebar/agent-code-section` (Task 2); `config` del paquete `config`.
- Produces: la `Sidebar` renderiza la sección en todas las páginas (autenticadas) cuando `config.codingAgentEnabled()`; `/agent/code` deja de existir.

- [ ] **Step 1: Verificar que el estado actual rompe (test manual previo)**

Run: `pnpm --filter chatbot type:check`
Expected: TODO en verde (aún no hay cambios; esto confirma el punto de partida limpio).

- [ ] **Step 2: Modificar la Sidebar**

En `packages/chatbot/components/layout/sidebar/sidebar.tsx`:

- Sustituye el import de `AgentCodeNav`:

```tsx
import { AgentCodeNav } from "@/components/layout/sidebar/agent-code-nav";
```

por:

```tsx
import {
  AgentCodeSection,
  AgentCodeSectionLoading,
} from "@/components/layout/sidebar/agent-code-section";
```

- Sustituye el render de `<AgentCodeNav />` (entre `<RAGNav />` y el `Suspense` de `ProjectList`):

```tsx
<Suspense fallback={<AgentCodeSectionLoading className="my-0 mt-4" />}>
  <AgentCodeProjects />
</Suspense>
```

- Añade debajo del componente `Sidebar` (mismo archivo) un componente servidor que resuelve los proyectos:

```tsx
const AgentCodeProjects: React.FC = async () => {
  if (!config.codingAgentEnabled()) return null;
  const projects = await getCodingAgentProjects();
  return <AgentCodeSection projects={projects} />;
};
```

- Añade el import de `getCodingAgentProjects` y de `config`:

```tsx
import { config } from "config";
import { getCodingAgentProjects } from "@/lib/features/code/actions";
```

> Nota: `Sidebar` y sus helpers ya son server components (async); `AgentCodeProjects` sigue el mismo patrón. `getCodingAgentProjects` es una server action importable desde el servidor; en entorno de test devuelve `["ai-chatbot"]` (mock existente).

- [ ] **Step 3: Eliminar los tres archivos obsoletos**

```bash
rm packages/chatbot/components/layout/sidebar/agent-code-nav.tsx \
   packages/chatbot/components/code/coding-agent-explorer.tsx \
   "packages/chatbot/app/(chat)/agent/code/page.tsx"
```

- [ ] **Step 4: Verificar type check y suite completa**

Run: `pnpm --filter chatbot type:check && pnpm --filter chatbot lint && pnpm --filter chatbot exec vitest run tests/unit tests/component tests/integration tests/contract --passWithNoTests`
Expected: todo verde. Si algún test unitario/component importa `CodingAgentExplorer` o `AgentCodeNav` (no debería según la auditoría previa), eliminarlo ajustando el test.

- [ ] **Step 5: Commit**

```bash
git add -A packages/chatbot/components/layout/sidebar packages/chatbot/components/code "packages/chatbot/app/(chat)/agent/code"
git commit -m "feat(agent-code): drop the /agent/code landing in favor of the sidebar section

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Actualizar los E2E del coding agent

**Files:**
- Modify: `packages/chatbot/tests/e2e/agent-code/agent-code.spec.ts`
- Modify: `packages/chatbot/tests/e2e/agent-code/reconnect.spec.ts`
- Modify: `packages/chatbot/tests/e2e/agent-code/tool-call-grouping.spec.ts`

**Interfaces:**
- Consumes: la sección del sidebar (`data-testid="agent-new-session"` con aria-label `New session in <project>`), el logo del header como toggle del sidebar (`aria-label="Toggle sidebar"`), ruta de sesión `/agent/code/{project}/{sessionId}`.
- Produces: los specs E2E crean sesiones vía la nueva UI del sidebar y verifican que `/agent/code` devuelve 404.

- [ ] **Step 1: Renombrar el test inicial de agent-code.spec.ts**

En `packages/chatbot/tests/e2e/agent-code/agent-code.spec.ts`, sustituye la apertura del test existente:

```ts
test("user can navigate to a session and send a message", async ({ page }) => {
  await page.goto("/agent/code");
  await expect(page.getByRole("heading", { name: "Coding Agent" })).toBeVisible();

  await page.click("text=ai-chatbot");
  await expect(page.getByText("New session")).toBeVisible();

  await page.click("text=+ New session");
  await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
```

por:

```ts
test("user can create a session from the sidebar and send a message", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Toggle sidebar").click();
  await page.getByTestId("agent-new-session").click();
  await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
  // El overlay del sidebar cubre la pantalla; se cierra antes de tocar el chat.
  await page.getByLabel("Toggle sidebar").click();
```

El resto del test (esperar `chat-container`, escribir y enviar el mensaje, ver "Hello from stub") se mantiene igual.

- [ ] **Step 2: Añadir el test de 404 a agent-code.spec.ts**

Añade un segundo `test(...)` dentro del `test.describe("Coding Agent", ...)`:

```ts
test("the /agent/code landing is gone", async ({ page }) => {
  const response = await page.goto("/agent/code");
  expect(response?.status()).toBe(404);
});
```

- [ ] **Step 3: Actualizar reconnect.spec.ts**

En `packages/chatbot/tests/e2e/agent-code/reconnect.spec.ts`, sustituye:

```ts
await page.goto("/agent/code");
await page.click("text=ai-chatbot");
await page.click("text=+ New session");
await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
```

por:

```ts
await page.goto("/");
await page.getByLabel("Toggle sidebar").click();
await page.getByTestId("agent-new-session").click();
await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
await page.getByLabel("Toggle sidebar").click();
```

- [ ] **Step 4: Actualizar tool-call-grouping.spec.ts**

En `packages/chatbot/tests/e2e/agent-code/tool-call-grouping.spec.ts`, sustituye el mismo bloque de apertura por:

```ts
await page.goto("/");
await page.getByLabel("Toggle sidebar").click();
await page.getByTestId("agent-new-session").click();
await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
await page.getByLabel("Toggle sidebar").click();
```

- [ ] **Step 5: Correr los E2E del agente**

Run: `pnpm --filter chatbot exec playwright test tests/e2e/agent-code/`
Expected: los 4 tests pasan (1 nuevo 404 + 3 flujos). Si algún selector falla por timing de carga de la sección, añadir `await expect(page.getByTestId("agent-new-session")).toBeVisible()` antes del click (el sidebar ya está abierto tras el toggle, la sección se renderiza en el HTML inicial).

- [ ] **Step 6: Commit**

```bash
git add packages/chatbot/tests/e2e/agent-code/
git commit -m "test(agent-code): e2e via sidebar session creation and 404 for /agent/code

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Verificación final

- [ ] `pnpm verify:fast` completo en verde (lint + type check + unit/component/integration/contract).
- [ ] E2E del agente en verde: `pnpm --filter chatbot exec playwright test tests/e2e/agent-code/`.
- [ ] Revisión manual (dev server `pnpm dev`): abrir el sidebar en `/`, expandir un proyecto con sesiones, ver highlight de proyecto/sesión al navegar entre sesiones, crear sesión con `+`, comprobar 404 en `/agent/code`.