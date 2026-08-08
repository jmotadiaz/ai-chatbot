# Reasoning Effort en el Coding Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar por defecto el reasoning effort máximo por modelo (campo `defaultThinkingLevel` en el catálogo) y permitir cambiarlo por sesión desde la UI del coding agent.

**Architecture:** El catálogo (`packages/models`) declara `defaultThinkingLevel` por modelo. El worker (`packages/coding-agent`) recibe el default en el RPC `initializeSession` y lo aplica al crear la sesión y al cambiar de modelo (`session.setThinkingLevel`, que Pi clampea al modelo). Dos RPCs nuevos (`getSessionThinkingLevel`/`setSessionThinkingLevel`) alimentan un chat control con icono de settings dentro del textarea del coding agent.

**Tech Stack:** TypeScript, Pi SDK (`@earendil-works/pi-coding-agent`), Next.js App Router, React hooks, vitest, pnpm workspace.

## Global Constraints

- Package manager: **pnpm** (workspace mode). Commands: `pnpm --filter models --filter chatbot test:unit`, `pnpm --filter models --filter chatbot type:check`, `pnpm lint:fix`.
- Todos los commits deben incluir `Co-Authored-By: Pi Coding Agent <pi@example.com>`.
- El paquete `models` es la única fuente de verdad del catálogo; no duplicar la lista de modelos en otro paquete.
- `models.json` NO cambia: `defaultThinkingLevel` no es un campo que Pi entienda; se aplica por sesión en el worker.
- Tipos Pi thinking levels: `"off" | "minimal" | "low" | "medium" | "high" | "xhigh"` (tipo `ThinkingLevel`).
- El nivel viaja entre chatbot y worker como string plano (`level` en el body JSON del RPC).

---

### Task 1: Catálogo — `ThinkingLevel`, `defaultThinkingLevel`, `getDefaultThinkingLevel`

**Files:**
- Modify: `packages/models/src/catalog.ts`
- Modify: `packages/models/src/index.ts`
- Test: `packages/models/src/catalog.test.ts`

**Interfaces:**
- Consumes: `MODEL_CATALOG`, `InvocableModelId`, `ModelCatalogEntry` (existentes).
- Produces:
  - `export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";`
  - `ModelCatalogEntry.defaultThinkingLevel?: ThinkingLevel`
  - `export function getDefaultThinkingLevel(modelId: InvocableModelId): ThinkingLevel | undefined`
  - Ambos exportados desde `packages/models` (index.ts) para que worker y chatbot los importen.

- [ ] **Step 1: Write the failing test**

Añadir al final de `packages/models/src/catalog.test.ts`:

```ts
import { MODEL_CATALOG, getDefaultThinkingLevel, type ThinkingLevel } from "./catalog";

describe("defaultThinkingLevel", () => {
  const LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

  it("declares a valid defaultThinkingLevel for every userInvocable model", () => {
    for (const entry of MODEL_CATALOG) {
      if (!entry.userInvocable) continue;
      expect(LEVELS).toContain(entry.defaultThinkingLevel);
    }
  });

  it("resolves the catalog default for known coding-agent models", () => {
    expect(getDefaultThinkingLevel("Deepseek v4 Pro")).toBe("xhigh");
    expect(getDefaultThinkingLevel("Kimi K2.7 Code")).toBe("high");
  });

  it("returns undefined for models without a declared default", () => {
    expect(getDefaultThinkingLevel("StepFun 3.5" as never)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter models test:unit`
Expected: FAIL — `getDefaultThinkingLevel is not defined` / `defaultThinkingLevel` no existe en las entradas.

- [ ] **Step 3: Implement in `packages/models/src/catalog.ts`**

1. Añadir el tipo antes de `export interface ModelCatalogEntry`:

```ts
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
```

2. Añadir el campo tras `reasoning?: boolean;` en `ModelCatalogEntry`:

```ts
  /**
   * Nivel de razonamiento aplicado por defecto al crear una sesión de coding
   * agent (o al cambiar de modelo). Pi lo clampea a lo que el modelo soporta.
   */
  defaultThinkingLevel?: ThinkingLevel;
```

3. Añadir `defaultThinkingLevel: "xhigh",` tras `reasoning: true,` en las entradas **Deepseek v4 Flash** y **Deepseek v4 Pro**.

4. Añadir `defaultThinkingLevel: "high",` tras `reasoning: true,` (o tras la última propiedad) en: **Kimi K2.7 Code**, **Kimi K3**, **MiniMax M3**, **Qwen 3.7 Plus**, **Qwen 3.8 Max**, **MiMo V2.5**, **MiMo V2.5 Pro**.

5. Añadir la función al final del archivo (después de `INVOCABLE_MODEL_IDS`):

```ts
export function getDefaultThinkingLevel(
  modelId: InvocableModelId,
): ThinkingLevel | undefined {
  return MODEL_CATALOG.find((e) => e.id === modelId)?.defaultThinkingLevel;
}
```

- [ ] **Step 4: Export desde `packages/models/src/index.ts`**

```ts
export {
  MODEL_CATALOG,
  INVOCABLE_MODEL_IDS,
  getDefaultThinkingLevel,
  type Company,
  type InvocableModelId,
  type ModelCatalogEntry,
  type ModelCost,
  type ModelId,
  type ProviderKind,
  type ThinkingLevel,
} from "./catalog";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter models test:unit`
Expected: PASS (los 3 nuevos tests + los existentes).

- [ ] **Step 6: Commit**

```bash
git add packages/models/src/catalog.ts packages/models/src/index.ts packages/models/src/catalog.test.ts
git commit -m "feat(models): add defaultThinkingLevel per catalog model

Co-Authored-By: Pi Coding Agent <pi@example.com>"
```

---

### Task 2: Worker — aplicar `defaultThinkingLevel` al crear sesión y al cambiar de modelo

**Files:**
- Modify: `packages/coding-agent/src/session-manager.ts`
- Test: `packages/chatbot/tests/unit/agent-code/session-manager-thinking-level.test.ts`

**Interfaces:**
- Consumes: `ThinkingLevel` (de `models`), `SessionEntry`, `sessions` Map (existentes).
- Produces:
  - `export function applyDefaultThinkingLevel(entry: SessionEntry, level: ThinkingLevel | undefined): void`
  - `getOrCreateSession(options)` gana `defaultThinkingLevel?: ThinkingLevel` y lo aplica en creación y en cambio de modelo.

- [ ] **Step 1: Write the failing test**

Crear `packages/chatbot/tests/unit/agent-code/session-manager-thinking-level.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const {
  __resetSessionsForTests,
  __seedSessionForTests,
  applyDefaultThinkingLevel,
  getSessionThinkingLevel,
  setSessionThinkingLevel,
} = await import("coding-agent/session-manager");
const { SessionEventLog } = await import("coding-agent/event-log");

function makeSession(overrides: Record<string, unknown> = {}) {
  const session = {
    thinkingLevel: "high",
    getAvailableThinkingLevels: () => ["off", "high", "xhigh"],
    setThinkingLevel: vi.fn((level: string) => {
      session.thinkingLevel = level;
    }),
    ...overrides,
  };
  return session;
}

function seed(sessionId: string, session: unknown) {
  __seedSessionForTests(sessionId, {
    sessionId,
    piSessionId: `pi-${sessionId}`,
    project: "p",
    runtime: { session } as never,
    eventLog: new SessionEventLog(),
  });
}

beforeEach(() => {
  __resetSessionsForTests();
});

describe("session-manager thinking level", () => {
  it("returns the current level and the model's available levels", async () => {
    seed("t-1", makeSession());
    expect(await getSessionThinkingLevel("t-1")).toEqual({
      level: "high",
      levels: ["off", "high", "xhigh"],
    });
  });

  it("returns null when the session does not exist", async () => {
    expect(await getSessionThinkingLevel("missing")).toBeNull();
    expect(await setSessionThinkingLevel("missing", "high")).toBeNull();
  });

  it("sets the level and reports the effective level", async () => {
    const session = makeSession();
    seed("t-2", session);
    const result = await setSessionThinkingLevel("t-2", "low");
    expect(session.setThinkingLevel).toHaveBeenCalledWith("low");
    expect(result).toEqual({ level: "low" });
  });

  it("applyDefaultThinkingLevel sets the level only when one is given", () => {
    const session = makeSession();
    const entry = {
      sessionId: "t-3",
      piSessionId: "pi-t-3",
      project: "p",
      runtime: { session } as never,
      eventLog: new SessionEventLog(),
    };
    applyDefaultThinkingLevel(entry as never, "xhigh");
    expect(session.setThinkingLevel).toHaveBeenCalledWith("xhigh");
    applyDefaultThinkingLevel(entry as never, undefined);
    expect(session.setThinkingLevel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot test:unit session-manager-thinking-level`
Expected: FAIL — `applyDefaultThinkingLevel` / `getSessionThinkingLevel` / `setSessionThinkingLevel` no existen.

- [ ] **Step 3: Implement en `packages/coding-agent/src/session-manager.ts`**

1. Import del tipo (añadir al bloque de imports, junto a los de `tracing`):

```ts
import type { ThinkingLevel } from "models";
```

2. Añadir el helper tras `__resetSessionsForTests`:

```ts
/**
 * Apply the catalog default thinking level to a session runtime. Pi clamps
 * the level to the model's capabilities (non-reasoning models → "off"), so
 * an unsupported level is never an error. No-op when no level is given.
 */
export function applyDefaultThinkingLevel(
  entry: SessionEntry,
  level: ThinkingLevel | undefined,
): void {
  if (!level) return;
  entry.runtime.session.setThinkingLevel(level);
}
```

3. En `getOrCreateSession`, añadir `defaultThinkingLevel?: ThinkingLevel;` a las options.

4. Tras el `await existing.runtime.session.setModel(model);` (bloque de cambio de modelo), añadir:

```ts
          applyDefaultThinkingLevel(existing, options.defaultThinkingLevel);
```

5. Sustituir el `sessions.set(sessionId, { ... })` final (creación) por:

```ts
  const entry: SessionEntry = {
    sessionId,
    piSessionId,
    project: options.project,
    runtime,
    eventLog: new SessionEventLog(),
  };
  sessions.set(sessionId, entry);
  applyDefaultThinkingLevel(entry, options.defaultThinkingLevel);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chatbot test:unit session-manager-thinking-level`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/src/session-manager.ts packages/chatbot/tests/unit/agent-code/session-manager-thinking-level.test.ts
git commit -m "feat(coding-agent): apply defaultThinkingLevel on session create and model switch

Co-Authored-By: Pi Coding Agent <pi@example.com>"
```

---

### Task 3: Worker — RPCs `getSessionThinkingLevel` / `setSessionThinkingLevel`

**Files:**
- Modify: `packages/coding-agent/src/session-manager.ts`
- Modify: `packages/coding-agent/src/transports/http.ts`
- Test: `packages/chatbot/tests/unit/agent-code/session-manager-thinking-level.test.ts` (ampliar)

**Interfaces:**
- Consumes: `loadSessionFromDisk` (existente), `sessions` Map, `ThinkingLevel`.
- Produces:
  - `getSessionThinkingLevel(sessionId: string, piSessionId?: string, project?: string): Promise<{ level: ThinkingLevel; levels: ThinkingLevel[] } | null>`
  - `setSessionThinkingLevel(sessionId: string, level: ThinkingLevel, piSessionId?: string, project?: string): Promise<{ level: ThinkingLevel } | null>`
  - RPCs HTTP `getSessionThinkingLevel` / `setSessionThinkingLevel` (params: `sessionId`, `piSessionId?`, `project?`; set además `level`). Respuesta envuelta: `{ thinking: ... }`.

- [ ] **Step 1: Write the failing test**

Añadir al final del `describe` de `session-manager-thinking-level.test.ts`:

```ts
  it("routes getSessionThinkingLevel through the RPC handler", async () => {
    const { handleRpc } = await import("coding-agent/transports/http");
    seed("t-4", makeSession());
    const res = await handleRpc(
      JSON.stringify({ method: "getSessionThinkingLevel", params: { sessionId: "t-4" }, id: 1 }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { thinking: unknown } };
    expect(body.result.thinking).toEqual({ level: "high", levels: ["off", "high", "xhigh"] });
  });

  it("routes setSessionThinkingLevel through the RPC handler", async () => {
    const { handleRpc } = await import("coding-agent/transports/http");
    const session = makeSession();
    seed("t-5", session);
    const res = await handleRpc(
      JSON.stringify({ method: "setSessionThinkingLevel", params: { sessionId: "t-5", level: "xhigh" }, id: 2 }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { thinking: { level: string } } };
    expect(session.setThinkingLevel).toHaveBeenCalledWith("xhigh");
    expect(body.result.thinking.level).toBe("xhigh");
  });
```

> Nota: `handleRpc` usa `setTraceSessionId` de `tracing`; el mock del archivo ya lo incluye (se añade en el paso 3 si faltara).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot test:unit session-manager-thinking-level`
Expected: FAIL — el RPC devuelve error "Method not found".

- [ ] **Step 3: Implement `getSessionThinkingLevel` / `setSessionThinkingLevel` en `session-manager.ts`**

Añadir justo después de `getSessionModel`:

```ts
export async function getSessionThinkingLevel(
  sessionId: string,
  piSessionId?: string,
  project?: string,
): Promise<{ level: ThinkingLevel; levels: ThinkingLevel[] } | null> {
  const log = getTraceLogger("worker");
  let entry = sessions.get(sessionId);

  if (!entry && piSessionId && project) {
    log.info("session.thinking_level_load_disk", { sessionId, piSessionId });
    entry = await loadSessionFromDisk(sessionId, piSessionId, project);
  }

  if (!entry) {
    log.info("session.thinking_level_not_found", { sessionId });
    return null;
  }

  const session = entry.runtime.session;
  return {
    level: session.thinkingLevel,
    levels: session.getAvailableThinkingLevels(),
  };
}

export async function setSessionThinkingLevel(
  sessionId: string,
  level: ThinkingLevel,
  piSessionId?: string,
  project?: string,
): Promise<{ level: ThinkingLevel } | null> {
  const log = getTraceLogger("worker");
  let entry = sessions.get(sessionId);

  if (!entry && piSessionId && project) {
    log.info("session.thinking_level_set_load_disk", { sessionId, piSessionId });
    entry = await loadSessionFromDisk(sessionId, piSessionId, project);
  }

  if (!entry) {
    log.info("session.thinking_level_set_not_found", { sessionId });
    return null;
  }

  entry.runtime.session.setThinkingLevel(level);
  return { level: entry.runtime.session.thinkingLevel };
}
```

- [ ] **Step 4: Registrar los RPCs en `packages/coding-agent/src/transports/http.ts`**

1. Añadir `getSessionThinkingLevel, setSessionThinkingLevel` al import de `"../session-manager"` y `import type { ThinkingLevel } from "models";`.

2. Añadir los cases en `handleRpc` (antes del `default`):

```ts
      case "getSessionThinkingLevel": {
        const { sessionId, piSessionId, project } = params as {
          sessionId: string;
          piSessionId?: string;
          project?: string;
        };
        result = {
          thinking: await getSessionThinkingLevel(sessionId, piSessionId, project),
        };
        break;
      }
      case "setSessionThinkingLevel": {
        const { sessionId, piSessionId, project, level } = params as {
          sessionId: string;
          piSessionId?: string;
          project?: string;
          level: ThinkingLevel;
        };
        result = {
          thinking: await setSessionThinkingLevel(sessionId, level, piSessionId, project),
        };
        break;
      }
```

3. En `summarizeRpcParams`, añadir:

```ts
    case "getSessionThinkingLevel":
      return {
        sessionId,
        hasPiSessionId: typeof p.piSessionId === "string",
        project: typeof p.project === "string" ? p.project : undefined,
      };
    case "setSessionThinkingLevel":
      return {
        sessionId,
        level: typeof p.level === "string" ? p.level : undefined,
        hasPiSessionId: typeof p.piSessionId === "string",
        project: typeof p.project === "string" ? p.project : undefined,
      };
```

4. En `summarizeRpcResult`, añadir:

```ts
    case "getSessionThinkingLevel":
    case "setSessionThinkingLevel": {
      const thinking = r.thinking as { level?: unknown; levels?: unknown } | null;
      return {
        level: thinking && typeof thinking.level === "string" ? thinking.level : null,
        levelCount:
          thinking && Array.isArray(thinking.levels) ? thinking.levels.length : 0,
      };
    }
```

5. Si el mock de `tracing` del test no tiene `setTraceSessionId`, añadirlo al `vi.mock` (el test de Task 2 ya incluye el mock; verificar que tenga `setTraceSessionId: () => {}`).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter chatbot test:unit session-manager-thinking-level`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/coding-agent/src/session-manager.ts packages/coding-agent/src/transports/http.ts packages/chatbot/tests/unit/agent-code/session-manager-thinking-level.test.ts
git commit -m "feat(coding-agent): add get/setSessionThinkingLevel RPCs

Co-Authored-By: Pi Coding Agent <pi@example.com>"
```

---

### Task 4: Chatbot — cliente worker + endpoint `thinking-level` (GET/POST)

**Files:**
- Modify: `packages/chatbot/lib/features/code/worker-client.ts`
- Create: `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/thinking-level/route.ts`
- Test: `packages/chatbot/tests/unit/agent-code/thinking-level-route.test.ts`

**Interfaces:**
- Consumes: RPCs del worker (Task 3), `withAuth`, `getSession` de `session-store`, `WorkerClient` (existentes).
- Produces:
  - `WorkerClient.getSessionThinkingLevel(params: { sessionId; piSessionId?; project? }): Promise<{ thinking: { level: string; levels: string[] } | null }>`
  - `WorkerClient.setSessionThinkingLevel(params: { sessionId; level; piSessionId?; project? }): Promise<{ thinking: { level: string } | null }>`
  - `GET /api/agent/code/sessions/[sessionId]/thinking-level` → `{ thinking: { level, levels } | null }`
  - `POST /api/agent/code/sessions/[sessionId]/thinking-level` (body `{ level }`) → `{ thinking: { level } | null }`

- [ ] **Step 1: Write the failing test**

Crear `packages/chatbot/tests/unit/agent-code/thinking-level-route.test.ts` (patrón de `model-route.test.ts`):

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

const mockState: {
  dbSession: Record<string, unknown> | undefined;
  thinking: { level: string; levels: string[] } | null;
  levelAfterSet: string | null;
  getParams: unknown[];
  setParams: unknown[];
} = vi.hoisted(() => ({
  dbSession: undefined,
  thinking: null,
  levelAfterSet: null,
  getParams: [] as unknown[],
  setParams: [] as unknown[],
}));

vi.mock("@/lib/features/code/session-store", () => ({
  getSession: vi.fn(async () => mockState.dbSession),
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async getSessionThinkingLevel(params: unknown) {
      mockState.getParams.push(params);
      return { thinking: mockState.thinking };
    }
    async setSessionThinkingLevel(params: unknown) {
      mockState.setParams.push(params);
      return { thinking: { level: mockState.levelAfterSet } };
    }
  },
}));

import { GET, POST } from "@/app/(chat)/api/agent/code/sessions/[sessionId]/thinking-level/route";

function makeGetRequest() {
  return new Request("http://test/api/agent/code/sessions/s1/thinking-level");
}

function makePostRequest(level: string) {
  return new Request("http://test/api/agent/code/sessions/s1/thinking-level", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level }),
  });
}

beforeEach(() => {
  mockState.dbSession = {
    sessionId: "s1",
    project: "p",
    piSessionId: "pi-1",
    modelId: "Deepseek v4 Pro",
  };
  mockState.thinking = null;
  mockState.levelAfterSet = null;
  mockState.getParams = [];
  mockState.setParams = [];
});

describe("GET /api/agent/code/sessions/[sessionId]/thinking-level", () => {
  it("returns the worker's level and available levels", async () => {
    mockState.thinking = { level: "high", levels: ["off", "high", "xhigh"] };

    const res = await GET(makeGetRequest() as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      thinking: { level: "high", levels: ["off", "high", "xhigh"] },
    });
    expect(mockState.getParams[0]).toEqual({
      sessionId: "s1",
      piSessionId: "pi-1",
      project: "p",
    });
  });

  it("returns 404 when the session does not exist", async () => {
    mockState.dbSession = undefined;

    const res = await GET(makeGetRequest() as never);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/agent/code/sessions/[sessionId]/thinking-level", () => {
  it("sets the level and returns the effective level", async () => {
    mockState.levelAfterSet = "xhigh";

    const res = await POST(makePostRequest("xhigh") as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ thinking: { level: "xhigh" } });
    expect(mockState.setParams[0]).toEqual({
      sessionId: "s1",
      level: "xhigh",
      piSessionId: "pi-1",
      project: "p",
    });
  });

  it("returns 400 when level is missing", async () => {
    const res = await POST(makePostRequest("") as never);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot test:unit thinking-level-route`
Expected: FAIL — el route no existe (módulo no encontrado).

- [ ] **Step 3: Implement `worker-client.ts`**

Añadir tras `getSessionModel`:

```ts
  async getSessionThinkingLevel(params: {
    sessionId: string;
    piSessionId?: string;
    project?: string;
  }): Promise<{ thinking: { level: string; levels: string[] } | null }> {
    return this.call("getSessionThinkingLevel", params);
  }

  async setSessionThinkingLevel(params: {
    sessionId: string;
    level: string;
    piSessionId?: string;
    project?: string;
  }): Promise<{ thinking: { level: string } | null }> {
    return this.call("setSessionThinkingLevel", params);
  }
```

Y en `summarizeWorkerRpcParams`, añadir:

```ts
    case "getSessionThinkingLevel":
      return {
        sessionId,
        hasPiSessionId: typeof p.piSessionId === "string",
        project: typeof p.project === "string" ? p.project : undefined,
      };
    case "setSessionThinkingLevel":
      return {
        sessionId,
        level: typeof p.level === "string" ? p.level : undefined,
        hasPiSessionId: typeof p.piSessionId === "string",
        project: typeof p.project === "string" ? p.project : undefined,
      };
```

- [ ] **Step 4: Crear el route**

Crear `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/thinking-level/route.ts`:

```ts
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";

function getSessionIdFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

export const GET = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ thinking: null }, { status: 404 });
  }

  const client = new WorkerClient();
  const thinking = await client.getSessionThinkingLevel({
    sessionId,
    piSessionId: dbSession.piSessionId ?? undefined,
    project: dbSession.project,
  });
  return Response.json({ thinking });
});

export const POST = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ thinking: null }, { status: 404 });
  }

  const body = (await req.json()) as { level?: string };
  if (typeof body.level !== "string" || body.level.length === 0) {
    return Response.json({ error: "level is required" }, { status: 400 });
  }

  const client = new WorkerClient();
  const thinking = await client.setSessionThinkingLevel({
    sessionId,
    level: body.level,
    piSessionId: dbSession.piSessionId ?? undefined,
    project: dbSession.project,
  });
  return Response.json({ thinking });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter chatbot test:unit thinking-level-route`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/chatbot/lib/features/code/worker-client.ts "packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/thinking-level/route.ts" packages/chatbot/tests/unit/agent-code/thinking-level-route.test.ts
git commit -m "feat(chatbot): add session thinking-level endpoint (get/set)

Co-Authored-By: Pi Coding Agent <pi@example.com>"
```

---

### Task 5: Chatbot — pasar `defaultThinkingLevel` en el flujo de mensaje

**Files:**
- Modify: `packages/chatbot/app/(chat)/api/agent/code/route.ts`
- Test: `packages/chatbot/tests/unit/agent-code/run-route-thinking-level.test.ts`

**Interfaces:**
- Consumes: `getDefaultThinkingLevel` (Task 1), `toPiModelId`, `WorkerClient.initializeSession`.
- Produces: `initializeSession` recibe `defaultThinkingLevel?: ThinkingLevel` derivado del `modelId` del context.

- [ ] **Step 1: Write the failing test**

Crear `packages/chatbot/tests/unit/agent-code/run-route-thinking-level.test.ts`:

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

const mockState: {
  dbSession: Record<string, unknown> | undefined;
  initParams: unknown[];
} = vi.hoisted(() => ({
  dbSession: undefined,
  initParams: [] as unknown[],
}));

vi.mock("@/lib/features/code/session-store", () => ({
  getSession: vi.fn(async () => mockState.dbSession),
  touchSession: vi.fn(async () => {}),
  updatePiSessionId: vi.fn(async () => {}),
  updateSessionLabel: vi.fn(async () => {}),
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async initializeSession(params: unknown) {
      mockState.initParams.push(params);
      return { sessionId: "s1", piSessionId: "pi-1" };
    }
    async sendPrompt() {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    }
  },
}));

import { POST } from "@/app/(chat)/api/agent/code/route";

function makeRequest() {
  return new Request("http://test/api/agent/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      threadId: "s1",
      context: [
        { description: "project", value: "p" },
        { description: "sessionId", value: "s1" },
        { description: "modelId", value: "Deepseek v4 Pro" },
      ],
      messages: [{ id: "u1", role: "user", content: "hola" }],
      runId: "r1",
    }),
  });
}

beforeEach(() => {
  mockState.dbSession = {
    sessionId: "s1",
    project: "p",
    piSessionId: null,
    label: null,
  };
  mockState.initParams = [];
});

describe("POST /api/agent/code", () => {
  it("passes the catalog defaultThinkingLevel for the selected model", async () => {
    const res = await POST(makeRequest() as never);

    expect(res.status).toBe(200);
    const init = mockState.initParams[0] as {
      modelId?: string;
      defaultThinkingLevel?: string;
    };
    expect(init.modelId).toBe("opencode-go/deepseek-v4-pro");
    expect(init.defaultThinkingLevel).toBe("xhigh");
  });

  it("omits defaultThinkingLevel when the model has none declared", async () => {
    const req = new Request("http://test/api/agent/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "s1",
        context: [
          { description: "project", value: "p" },
          { description: "sessionId", value: "s1" },
          { description: "modelId", value: "Kimi K3" },
        ],
        messages: [{ id: "u1", role: "user", content: "hola" }],
        runId: "r2",
      }),
    });
    mockState.dbSession = { sessionId: "s1", project: "p", piSessionId: null, label: null };

    const res = await POST(req as never);

    expect(res.status).toBe(200);
    const init = mockState.initParams[0] as {
      defaultThinkingLevel?: string;
    };
    expect(init.defaultThinkingLevel).toBe("high");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot test:unit run-route-thinking-level`
Expected: FAIL — `defaultThinkingLevel` no está en `initParams`.

- [ ] **Step 3: Implement en `packages/chatbot/app/(chat)/api/agent/code/route.ts`**

1. Añadir al import de `"models"`:

```ts
import { getDefaultThinkingLevel, toPiModelId } from "models";
```

2. Tras la resolución de `modelId` (después del bloque `if (!modelId)`), añadir:

```ts
  const defaultThinkingLevel = modelId
    ? getDefaultThinkingLevel(modelId as chatModelId)
    : undefined;
```

3. Añadir `defaultThinkingLevel` a la llamada `client.initializeSession({ ... })`:

```ts
      const initResult = await client.initializeSession({
        userId: user.id,
        sessionId,
        project,
        modelId: piModelId
          ? `${piModelId.providerId}/${piModelId.modelId}`
          : undefined,
        defaultThinkingLevel,
        piSessionId: dbSession.piSessionId ?? undefined,
        _traceRunId: runId,
      });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chatbot test:unit run-route-thinking-level`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "packages/chatbot/app/(chat)/api/agent/code/route.ts" packages/chatbot/tests/unit/agent-code/run-route-thinking-level.test.ts
git commit -m "feat(chatbot): pass catalog defaultThinkingLevel to initializeSession

Co-Authored-By: Pi Coding Agent <pi@example.com>"
```

---

### Task 6: Chatbot — hook `useCodingAgentSessionThinkingLevel`

**Files:**
- Create: `packages/chatbot/lib/features/code/hooks/use-coding-agent-session-thinking-level.ts`
- Test: `packages/chatbot/tests/unit/agent-code/use-coding-agent-thinking-level.test.tsx`

**Interfaces:**
- Consumes: endpoint de Task 4, `ThinkingLevel` de `models`.
- Produces:
  - `useCodingAgentSessionThinkingLevel({ sessionId: string; modelId: string | null; enabled: boolean }): { level: ThinkingLevel | null; levels: ThinkingLevel[]; isLoading: boolean; setLevel: (level: ThinkingLevel) => Promise<void> }`
  - Refetch cuando cambia `modelId`; `setLevel` hace POST y actualiza con el nivel efectivo.

- [ ] **Step 1: Write the failing test**

Crear `packages/chatbot/tests/unit/agent-code/use-coding-agent-thinking-level.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCodingAgentSessionThinkingLevel } from "@/lib/features/code/hooks/use-coding-agent-session-thinking-level";

const okJson = (data: unknown) => async () => data;

describe("useCodingAgentSessionThinkingLevel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: okJson({ thinking: { level: "high", levels: ["off", "high", "xhigh"] } }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the level and available levels for the session", async () => {
    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({ sessionId: "s1", modelId: "Deepseek v4 Pro", enabled: true }),
    );

    await waitFor(() => expect(result.current.level).toBe("high"));
    expect(result.current.levels).toEqual(["off", "high", "xhigh"]);
    expect(result.current.isLoading).toBe(false);
    expect(fetch).toHaveBeenCalledWith("/api/agent/code/sessions/s1/thinking-level");
  });

  it("refetches when the model changes", async () => {
    const fetchMock = vi.mocked(fetch);
    const { rerender } = renderHook(
      ({ modelId }) =>
        useCodingAgentSessionThinkingLevel({ sessionId: "s1", modelId, enabled: true }),
      { initialProps: { modelId: "Deepseek v4 Pro" } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ modelId: "Kimi K2.7 Code" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("stays idle while disabled or without a model", () => {
    const fetchMock = vi.mocked(fetch);
    renderHook(() =>
      useCodingAgentSessionThinkingLevel({ sessionId: "s1", modelId: null, enabled: true }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs the level and adopts the effective level", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: okJson({ thinking: { level: "high", levels: ["off", "high", "xhigh"] } }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: okJson({ thinking: { level: "xhigh" } }),
    });

    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({ sessionId: "s1", modelId: "Deepseek v4 Pro", enabled: true }),
    );
    await waitFor(() => expect(result.current.level).toBe("high"));

    await act(async () => {
      await result.current.setLevel("xhigh");
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/agent/code/sessions/s1/thinking-level",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ level: "xhigh" }),
      }),
    );
    expect(result.current.level).toBe("xhigh");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot test:unit use-coding-agent-thinking-level`
Expected: FAIL — el módulo del hook no existe.

- [ ] **Step 3: Implement el hook**

Crear `packages/chatbot/lib/features/code/hooks/use-coding-agent-session-thinking-level.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import type { ThinkingLevel } from "models";

export interface UseCodingAgentSessionThinkingLevelArgs {
  sessionId: string;
  /** Modelo activo; el nivel se refetches cuando cambia (el worker aplicó el default del nuevo modelo). */
  modelId: string | null;
  enabled: boolean;
}

export interface UseCodingAgentSessionThinkingLevelResult {
  /** null mientras carga o si no hay datos aún. */
  level: ThinkingLevel | null;
  /** Niveles disponibles del modelo actual; ["off"] si el modelo no razona. */
  levels: ThinkingLevel[];
  isLoading: boolean;
  setLevel: (level: ThinkingLevel) => Promise<void>;
}

export function useCodingAgentSessionThinkingLevel({
  sessionId,
  modelId,
  enabled,
}: UseCodingAgentSessionThinkingLevelArgs): UseCodingAgentSessionThinkingLevelResult {
  const [level, setLevelState] = useState<ThinkingLevel | null>(null);
  const [levels, setLevels] = useState<ThinkingLevel[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !modelId) return;
    let cancelled = false;
    setIsLoading(true);

    const load = async () => {
      try {
        const response = await fetch(
          `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/thinking-level`,
        );
        if (!response.ok) {
          throw new Error(`Failed to load thinking level: ${response.status}`);
        }
        const data = (await response.json()) as {
          thinking: { level: ThinkingLevel; levels: ThinkingLevel[] } | null;
        };
        if (!cancelled && data.thinking) {
          setLevelState(data.thinking.level);
          setLevels(data.thinking.levels);
        }
      } catch {
        // Worker caído o red: mantener el estado anterior.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionId, modelId, enabled]);

  const setLevel = async (next: ThinkingLevel) => {
    const response = await fetch(
      `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/thinking-level`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: next }),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to set thinking level: ${response.status}`);
    }
    const data = (await response.json()) as {
      thinking: { level: ThinkingLevel } | null;
    };
    if (data.thinking) setLevelState(data.thinking.level);
  };

  return { level, levels, isLoading, setLevel };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chatbot test:unit use-coding-agent-thinking-level`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/lib/features/code/hooks/use-coding-agent-session-thinking-level.ts packages/chatbot/tests/unit/agent-code/use-coding-agent-thinking-level.test.tsx
git commit -m "feat(chatbot): add useCodingAgentSessionThinkingLevel hook

Co-Authored-By: Pi Coding Agent <pi@example.com>"
```

---

### Task 7: Chatbot — control de reasoning en el textarea

**Files:**
- Create: `packages/chatbot/components/code/reasoning-control.tsx`
- Modify: `packages/chatbot/components/code/agent-code-chat.tsx`
- Test: `packages/chatbot/tests/unit/agent-code/reasoning-control.test.tsx`

**Interfaces:**
- Consumes: `useCodingAgentSessionThinkingLevel` (Task 6), `ChatControl`, `Dropdown`/`useDropdown` (existentes), `ThinkingLevel`.
- Produces: componente `ReasoningControl` con props `{ level: ThinkingLevel | null; levels: ThinkingLevel[]; isLoading: boolean; onSelect: (level: ThinkingLevel) => void }`; se renderiza solo si `levels.length > 1`. Integrado en la fila izquierda de controles del textarea.

- [ ] **Step 1: Write the failing test**

Crear `packages/chatbot/tests/unit/agent-code/reasoning-control.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReasoningControl } from "@/components/code/reasoning-control";

describe("ReasoningControl", () => {
  it("renders nothing when the model only supports off", () => {
    const { container } = render(
      <ReasoningControl level="off" levels={["off"]} isLoading={false} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the current level and opens a dropdown with the available levels", async () => {
    const onSelect = vi.fn();
    render(
      <ReasoningControl
        level="high"
        levels={["off", "high", "xhigh"]}
        isLoading={false}
        onSelect={onSelect}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Reasoning effort: high/ });
    expect(trigger).toBeTruthy();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: /xhigh/ }));

    expect(onSelect).toHaveBeenCalledWith("xhigh");
  });

  it("disables the trigger while loading", () => {
    render(
      <ReasoningControl level={null} levels={["off", "high"]} isLoading={true} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Reasoning effort/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot test:unit reasoning-control`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implement `reasoning-control.tsx`**

Crear `packages/chatbot/components/code/reasoning-control.tsx` (patrón de `skills-control.tsx`):

```tsx
"use client";

import { Check, Settings2 } from "lucide-react";
import { ChatControl } from "@/components/chat/control";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils/helpers";
import type { ThinkingLevel } from "models";

export interface ReasoningControlProps {
  level: ThinkingLevel | null;
  levels: ThinkingLevel[];
  isLoading: boolean;
  onSelect: (level: ThinkingLevel) => void;
}

export const ReasoningControl: React.FC<ReasoningControlProps> = ({
  level,
  levels,
  isLoading,
  onSelect,
}) => {
  const { getDropdownPopupProps, getDropdownTriggerProps } = useDropdown();

  // El modelo no razona (solo "off" disponible): sin control.
  if (levels.length <= 1) return null;

  return (
    <Dropdown.Container data-testid="coding-agent-reasoning-control">
      <ChatControl
        Icon={Settings2}
        type="button"
        aria-label={`Reasoning effort: ${level ?? "…"}`}
        title={`Reasoning effort: ${level ?? "…"}`}
        isActive={level !== null && level !== "off"}
        disabled={isLoading || level === null}
        {...getDropdownTriggerProps()}
      />
      <Dropdown.Popup
        {...getDropdownPopupProps()}
        variant="responsive-top-right"
        className="w-48"
      >
        <div className="py-2">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Reasoning effort
          </div>
          {levels.map((item) => (
            <button
              key={item}
              role="menuitem"
              onClick={() => onSelect(item)}
              className={cn(
                "flex w-full items-center justify-between px-4 py-2 text-sm hover:bg-secondary-accent-foreground",
                item === level && "font-semibold",
              )}
            >
              <span className="capitalize">{item}</span>
              {item === level && <Check size={16} />}
            </button>
          ))}
        </div>
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
```

> Nota: `ChatControl` no acepta `children`; el nivel actual se muestra en el `aria-label`/`title` del botón y con la marca ✓ en el ítem activo del dropdown. Si el test de "menuitem /xhigh/" fallara por el `<Check>` extra, usar `name: /xhigh/` (regex ya contemplado).

- [ ] **Step 4: Integrar en `agent-code-chat.tsx`**

1. Imports:

```tsx
import { ReasoningControl } from "./reasoning-control";
import { useCodingAgentSessionThinkingLevel } from "@/lib/features/code/hooks/use-coding-agent-session-thinking-level";
```

2. Tras el hook `useCodingAgentSkills` (dentro del componente):

```tsx
  const {
    level: thinkingLevel,
    levels: thinkingLevels,
    isLoading: isLoadingThinkingLevel,
    setLevel: setThinkingLevel,
  } = useCodingAgentSessionThinkingLevel({
    sessionId,
    modelId: modelId || null,
    enabled: !isLoading,
  });
```

3. En la fila izquierda de controles del textarea, antes de `AttachmentsControl`:

```tsx
            <ReasoningControl
              level={thinkingLevel}
              levels={thinkingLevels}
              isLoading={isLoadingThinkingLevel}
              onSelect={(next) => {
                void setThinkingLevel(next).catch(() => {});
              }}
            />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter chatbot test:unit reasoning-control`
Expected: PASS.

- [ ] **Step 6: Run los tests existentes del chat del agente**

Run: `pnpm --filter chatbot test:unit agent-code-chat`
Expected: PASS (los tests existentes de `agent-code-chat*.test.tsx` siguen pasando con el nuevo control).

- [ ] **Step 7: Commit**

```bash
git add packages/chatbot/components/code/reasoning-control.tsx packages/chatbot/components/code/agent-code-chat.tsx packages/chatbot/tests/unit/agent-code/reasoning-control.test.tsx
git commit -m "feat(chatbot): add reasoning effort control to the coding agent textarea

Co-Authored-By: Pi Coding Agent <pi@example.com>"
```

---

### Task 8: Verificación final

**Files:** ninguno (solo comandos).

- [ ] **Step 1: Type check**

Run: `pnpm --filter chatbot --filter models --filter coding-agent type:check`
Expected: PASS.

- [ ] **Step 2: Unit tests completos**

Run: `pnpm --filter chatbot --filter models test:unit`
Expected: PASS (los nuevos + los existentes).

- [ ] **Step 3: Lint**

Run: `pnpm lint:fix`
Expected: sin errores.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit final si hubo ajustes**

```bash
git add -A
git commit -m "chore: verify reasoning effort implementation

Co-Authored-By: Pi Coding Agent <pi@example.com>"
```

---

## Self-Review

**Spec coverage:**
- Default por modelo → Task 1 (catálogo) + Task 2 (worker lo aplica) + Task 5 (route lo pasa).
- Cambio de modelo aplica el default → Task 2 (`applyDefaultThinkingLevel` tras `setModel`).
- Control por sesión en la UI → Tasks 3–4 (RPCs y endpoint), Task 6 (hook), Task 7 (chat control en el textarea).
- Edge cases: nivel no soportado (clamp de Pi, documentado en Task 2 helper), modelo sin reasoning (`levels.length <= 1` → control oculto, Task 7), cold reload (`loadSessionFromDisk` en Task 3), sin default (`applyDefaultThinkingLevel` no-op, Task 2).

**Placeholder scan:** todos los pasos incluyen código o comandos concretos; no hay "TBD" ni "similar to Task N".

**Type consistency:** `ThinkingLevel` se define en Task 1 y se importa en Tasks 2, 6 y 7; `applyDefaultThinkingLevel(entry, level)` en Task 2 se usa en Task 2; `getSessionThinkingLevel`/`setSessionThinkingLevel` firmas consistentes entre Task 3 (worker) y Task 4 (cliente worker-client); la respuesta envuelta `{ thinking }` es idéntica en worker y cliente; `{ level, levels }` coincide en hook (Task 6), endpoint (Task 4) y worker (Task 3).

---

### Task 9: Chatbot — POST `sessions/[sessionId]/model` (aplicar modelo al vuelo)

**Files:**
- Modify: `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/model/route.ts`
- Test: `packages/chatbot/tests/unit/agent-code/model-route.test.ts` (ampliar)

**Interfaces:**
- Consumes: `toPiModelId`, `getDefaultThinkingLevel` (models), `WorkerClient.initializeSession`, `getSession` (existentes).
- Produces: `POST /api/agent/code/sessions/[sessionId]/model` con body `{ modelId }` → `{ modelId }`; 400 si falta `modelId` o no es invocable; 404 si no hay sesión DB. El worker aplica `setModel` + `defaultThinkingLevel` al vuelo (no-op si el modelo ya es el activo).

- [ ] **Step 1: Write the failing test** — ampliar `model-route.test.ts`:
  - Añadir `initializeSession` al mock de `WorkerClient` (registrando params en `mockState`).
  - Añadir un describe `POST .../model`: caso feliz (modelId "Deepseek v4 Pro" → initializeSession con `modelId: "opencode-go/deepseek-v4-pro"` y `defaultThinkingLevel: "xhigh"`), 400 sin modelId, 400 con modelo no invocable (p.ej. `"StepFun 3.5"` — `toPiModelId` lanza), 404 sin sesión.

- [ ] **Step 2: Run test to verify it fails** — `pnpm --filter chatbot test:unit model-route` — FAIL (POST no existe).

- [ ] **Step 3: Implement** — añadir a `model/route.ts`:

```ts
export const POST = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ modelId: null }, { status: 404 });
  }

  const body = (await req.json()) as { modelId?: string };
  if (!body.modelId) {
    return Response.json({ error: "modelId is required" }, { status: 400 });
  }

  let piModelId: { providerId: string; modelId: string };
  try {
    piModelId = toPiModelId(body.modelId as chatModelId);
  } catch {
    return Response.json({ error: `Unknown model: ${body.modelId}` }, { status: 400 });
  }

  const defaultThinkingLevel = getDefaultThinkingLevel(body.modelId as chatModelId);
  const client = new WorkerClient();
  await client.initializeSession({
    userId: user.id,
    sessionId,
    project: dbSession.project,
    modelId: `${piModelId.providerId}/${piModelId.modelId}`,
    defaultThinkingLevel,
    piSessionId: dbSession.piSessionId ?? undefined,
  });
  return Response.json({ modelId: body.modelId });
});
```

Imports a añadir: `toPiModelId, getDefaultThinkingLevel` de `"models"`, `chatModelId` de `@/lib/features/foundation-model/config`.

- [ ] **Step 4: Run test to verify it passes** — PASS.
- [ ] **Step 5: Commit** con `Co-Authored-By: Pi Coding Agent <pi@example.com>`.

---

### Task 10: Chatbot — `useCodingAgentSessionModel` aplica el modelo al vuelo

**Files:**
- Modify: `packages/chatbot/lib/features/code/hooks/use-coding-agent-session-model.ts`
- Test: `packages/chatbot/tests/unit/agent-code/use-coding-agent-session-model.test.tsx` (nuevo)

**Interfaces:**
- Consumes: endpoint de Task 9.
- Produces: `useCodingAgentSessionModel({ sessionId, fallbackModelId })` → `{ modelId: string | null; setModelId: (m: string) => void; isLoading: boolean; isApplying: boolean }`. `setModelId` actualiza el estado de forma optimista, hace POST y revierte si falla; `isApplying` true durante el POST.

- [ ] **Step 1: Write the failing test** (nuevo archivo, con `// @vitest-environment jsdom` en línea 1):
  - mock de `fetch` (GET inicial ok + POST ok) → al llamar `setModelId("Kimi K2.7 Code")` se hace POST con `{ modelId }`, `modelId` cambia de forma optimista y `isApplying` vuelve a false; con POST 500 → se revierte al modelo anterior.
- [ ] **Step 2: Run test to verify it fails** — FAIL (hook sin isApplying/POST).
- [ ] **Step 3: Implement** — `useRef` para el último modelo aplicado; `setModelId` con `useCallback`:

```ts
  const [isApplying, setIsApplying] = useState(false);

  const setModelId = useCallback(
    async (next: string) => {
      const previous = modelId;
      setModelIdState(next);
      setIsApplying(true);
      try {
        const response = await fetch(
          `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/model`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modelId: next }),
          },
        );
        if (!response.ok) {
          throw new Error(`Failed to set model: ${response.status}`);
        }
      } catch {
        setModelIdState(previous);
      } finally {
        setIsApplying(false);
      }
    },
    [sessionId, modelId],
  );

  return { modelId, setModelId, isLoading: modelId === null, isApplying };
```

Nota: `setModelId` pasa a ser async pero el contrato de uso (`(m) => void` en el picker) sigue compilando porque TS ignora el retorno en ese contexto.

- [ ] **Step 4: Run test to verify it passes** — PASS.
- [ ] **Step 5: Commit** con `Co-Authored-By`.

---

### Task 11: Chatbot — wiring `isApplying` → refetch del thinking tras aplicar el modelo

**Files:**
- Modify: `packages/chatbot/lib/features/code/hooks/use-coding-agent-session-thinking-level.ts`
- Modify: `packages/chatbot/components/code/agent-code-chat-layout.tsx`
- Modify: `packages/chatbot/components/code/agent-code-chat.tsx`
- Test: `packages/chatbot/tests/unit/agent-code/use-coding-agent-thinking-level.test.tsx` (ampliar)

**Interfaces:**
- Consumes: `isApplying` de Task 10.
- Produces: `useCodingAgentSessionThinkingLevel({ sessionId, modelId, enabled, isApplyingModel })` — refetch cuando `isApplyingModel` transiciona true→false (mismo patrón que `isRunning`). `AgentCodeChatProps` gana `isModelChanging?: boolean` (opcional). El layout pasa `isModelChanging={isApplying}`.

- [ ] **Step 1: Write the failing test** — ampliar `use-coding-agent-thinking-level.test.tsx`: nuevo test "refetches when the model change is applied (isApplyingModel true→false)" — mount con `isApplyingModel: true` (1 fetch), rerender false → 2º GET. Todos los `renderHook` existentes ganan `isApplyingModel: false`.
- [ ] **Step 2: Run test to verify it fails** — FAIL.
- [ ] **Step 3: Implement**:
  - Hook: añadir `isApplyingModel: boolean` a los args; `prevIsApplyingRef` y refetch en falling edge, idéntico al bloque de `isRunning` (mismo `load`).
  - `AgentCodeChatProps`: `isModelChanging?: boolean;` y pasarla al hook como `isApplyingModel: isModelChanging ?? false`.
  - Layout: `const { modelId, setModelId, isLoading: isLoadingModel, isApplying } = useCodingAgentSessionModel(...)`; `<AgentCodeChat ... isModelChanging={isApplying} />`.
- [ ] **Step 4: Run test to verify it passes** — PASS; correr también `agent-code-chat` y `agent-code-chat-layout` si existe test.
- [ ] **Step 5: Commit** con `Co-Authored-By`.

---

### Task 12: Verificación final

- [ ] **Step 1:** `pnpm --filter chatbot --filter models --filter coding-agent type:check` — PASS.
- [ ] **Step 2:** `pnpm --filter chatbot --filter models test:unit` — PASS.
- [ ] **Step 3:** `pnpm lint:fix` — limpio.
- [ ] **Step 4:** Commit final si hubo ajustes (con `Co-Authored-By`).

---

### Task 13: Revertir B2 — el modelo vuelve a viajar con el prompt

**Files:**
- Modify: `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/model/route.ts` (quitar POST)
- Modify: `packages/chatbot/lib/features/code/hooks/use-coding-agent-session-model.ts` (volver a estado local puro)
- Modify: `packages/chatbot/lib/features/code/hooks/use-coding-agent-session-thinking-level.ts` (quitar `isApplyingModel`; conservar `isRunning` + seq token)
- Modify: `packages/chatbot/components/code/agent-code-chat-layout.tsx` (quitar `isModelChanging`, disabled del picker)
- Modify: `packages/chatbot/components/code/agent-code-chat.tsx` (quitar prop)
- Modify: `packages/chatbot/components/code/reasoning-control.tsx` (quitar `isApplying` del disabled)
- Tests: `model-route.test.ts` (quitar describe POST), `use-coding-agent-session-model.test.tsx` (reducir a GET), `use-coding-agent-thinking-level.test.tsx` (quitar test `isApplyingModel`)

**Nota:** el guard del worker (`getOrCreateSession` rechaza `setModel` en sesiones streaming) y los `log.warn` de `session.model_not_in_registry` SE MANTIENEN como defensa inerte.

- [ ] **Step 1:** quitar el POST de `model/route.ts` y su describe en `model-route.test.ts` (los 4 tests del POST). Run: `pnpm --filter chatbot test:unit model-route` — PASS (5 tests GET restantes).
- [ ] **Step 2:** `use-coding-agent-session-model.ts` → eliminar `isApplying`, el `useCallback` de POST y el seq counter; `setModelId` vuelve a ser `(m: string) => void` con estado local. Reducir `use-coding-agent-session-model.test.tsx` al fetch inicial (GET) — borrar los tests de POST/revert. Run: `pnpm --filter chatbot test:unit use-coding-agent-session-model` — PASS.
- [ ] **Step 3:** hook thinking → quitar `isApplyingModel` de args/efectos (conservar `isRunning` y el seq token); `agent-code-chat-layout.tsx` → quitar `isModelChanging` y el disabled del picker; `agent-code-chat.tsx` → quitar la prop; `reasoning-control.tsx` → `disabled={isLoading || level === null}`. Quitar el test de `isApplyingModel` en `use-coding-agent-thinking-level.test.tsx` y `isApplyingModel: false` de los demás renderHook. Run: `pnpm --filter chatbot test:unit use-coding-agent-thinking-level reasoning-control agent-code-chat` — PASS.
- [ ] **Step 4:** suite completa + type:check. Run: `pnpm --filter chatbot test:unit` y `pnpm --filter chatbot --filter models type:check` — PASS.
- [ ] **Step 5: Commit** con `Co-Authored-By: Pi Coding Agent <pi@example.com>`.

---

### Task 14: Worker — `getAvailableModels` con `levels` por modelo

**Files:**
- Modify: `packages/models/src/catalog.ts` (helper `getSupportedThinkingLevels`)
- Modify: `packages/models/src/index.ts` (export)
- Modify: `packages/coding-agent/src/session-manager.ts` (`getAvailableModels`)
- Test: `packages/models/src/catalog.test.ts` (ampliar)

**Interfaces:**
- Produces: `export function getSupportedThinkingLevels(reasoning: boolean | undefined, thinkingLevelMap: ThinkingLevelMap | undefined): ThinkingLevel[]` en `models` (misma lógica que pi-ai: sin reasoning → `["off"]`; `xhigh` solo si hay mapping explícito; `null` → excluido). `getAvailableModels()` devuelve `Array<{ providerId; modelId; label; levels: ThinkingLevel[] }>`.

- [ ] **Step 1: Write the failing test** — en `catalog.test.ts`:
  - `getSupportedThinkingLevels(undefined, undefined)` → `["off"]`
  - `getSupportedThinkingLevels(true, undefined)` → `["off","minimal","low","medium","high"]` (xhigh exige mapping)
  - `getSupportedThinkingLevels(true, { minimal: null, low: null, medium: null, high: "high", xhigh: "max" })` → `["off","high","xhigh"]`
  - `getSupportedThinkingLevels(true, { minimal: null, low: null, medium: null })` → `["off","high"]`
- [ ] **Step 2:** run → FAIL (`getSupportedThinkingLevels` no existe).
- [ ] **Step 3: Implement** en `catalog.ts`:

```ts
const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

/** Misma semántica que pi-ai: niveles soportados según reasoning + thinkingLevelMap. */
export function getSupportedThinkingLevels(
  reasoning: boolean | undefined,
  thinkingLevelMap: ThinkingLevelMap | undefined,
): ThinkingLevel[] {
  if (!reasoning) return ["off"];
  return THINKING_LEVELS.filter((level) => {
    const mapped = thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === "xhigh") return mapped !== undefined;
    return true;
  });
}
```

  Exportar desde `index.ts`.
- [ ] **Step 4:** en `session-manager.ts`, `getAvailableModels()`: añadir `levels: getSupportedThinkingLevels(model.reasoning, (model as { thinkingLevelMap?: ThinkingLevelMap }).thinkingLevelMap)` al objeto mapeado (import de `models`). El filtro `provider === "opencode-go"` se mantiene. Test del worker: ampliar `session-manager-thinking-level.test.ts`? No — `getAvailableModels` usa un registry real; verificar el nuevo campo con el script manual (no unit test). Confirmar con `pnpm --filter chatbot --filter models --filter coding-agent type:check`.
- [ ] **Step 5: Commit** con `Co-Authored-By`.

---

### Task 15: Chatbot — dropdown informativo con los niveles del modelo seleccionado

**Files:**
- Modify: `packages/chatbot/lib/features/code/worker-client.ts` (`WorkerModel.levels`)
- Modify: `packages/chatbot/lib/features/code/actions.ts` (`getCodingAgentModels` devuelve niveles)
- Modify: `packages/chatbot/app/(chat)/agent/code/[project]/[sessionId]/page.tsx`
- Modify: `packages/chatbot/components/code/agent-code-chat-layout.tsx`
- Modify: `packages/chatbot/components/code/agent-code-chat.tsx`
- Modify: `packages/chatbot/lib/features/code/hooks/use-coding-agent-session-thinking-level.ts` (prop `levels` del modelo seleccionado)
- Test: `packages/chatbot/tests/unit/agent-code/use-coding-agent-thinking-level.test.tsx` (ampliar)

**Interfaces:**
- `WorkerModel` gana `levels: string[]`.
- `getCodingAgentModels()` devuelve `Array<{ id: InvocableModelId; levels: ThinkingLevel[] }>` (el route `/api/agent/code/models` y la page adaptan).
- `AgentCodeChatLayout` recibe `modelLevels: ReadonlyMap<string, ThinkingLevel[]>` y lo pasa a `AgentCodeChat` → hook: `useCodingAgentSessionThinkingLevel({ sessionId, modelId, enabled, levels: modelLevels.get(modelId) ?? [] })`. El hook usa la prop `levels` para el dropdown (fallback: `[]` → control oculto mientras no haya datos); el `level` sigue del GET `thinking-level` (post-run refetch con `isRunning`).

- [ ] **Step 1: Write the failing test** — en `use-coding-agent-thinking-level.test.tsx`: nuevo test "uses the selected model's levels for the dropdown while keeping the session level from the worker": `renderHook` con `levels={["off","high","xhigh"]}` y fetch que devuelve `{ thinking: { level: "high", levels: ["off","minimal","low","medium","high"] } }` → `result.current.levels` es `["off","high","xhigh"]` y `level` es `"high"`. Ajustar los renderHook existentes con `levels: []`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** — hook: nueva prop `levels: ThinkingLevel[]`; `setLevels` solo desde el prop (eliminar el set desde el fetch; el fetch solo setea `level`). Fallback: si la prop está vacía usar los del GET (`data.thinking.levels`) para no romper el arranque. Bridge: `actions.getCodingAgentModels` mapea con `filterAvailableChatModels` + niveles; page → layout (`modelLevels`) → `AgentCodeChat` → hook. El route `/api/agent/code/models` (GET) ya pasa por `getCodingAgentModels` — adaptar su tipo.
- [ ] **Step 4:** run → PASS; suite completa + type:check.
- [ ] **Step 5: Commit** con `Co-Authored-By`.

---

### Task 16: Verificación final

- [ ] **Step 1:** `pnpm --filter chatbot --filter models --filter coding-agent type:check` — PASS.
- [ ] **Step 2:** `pnpm --filter chatbot --filter models test:unit` — PASS.
- [ ] **Step 3:** `pnpm lint:fix` — limpio.
- [ ] **Step 4:** Commit final si hubo ajustes (con `Co-Authored-By`).
