# Coding Agent Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate a Pi SDK-based autonomous coding agent behind an AG-UI frontend, exposed as an opt-in feature under `/agent/code` with project/session routing.

**Architecture:** The frontend uses `@ag-ui/client` to stream events from a Next.js BFF. The BFF translates AG-UI requests into JSON-RPC calls to a standalone worker HTTP server running the Pi SDK. The worker executes tools inside `<CODING_AGENT_PROJECTS_ROOT>/<project>`. A configurable `CODING_AGENT_WORKER_URL` lets E2E tests point to a local stub instead of the real worker.

**Tech Stack:** Next.js App Router, React, TypeScript, `@ag-ui/client`, `@earendil-works/pi-coding-agent`, Drizzle ORM, Playwright, Vitest.

---

## File Structure

### Feature domain (`lib/features/agent-code`)

| File | Responsibility |
|---|---|
| `project-resolver.ts` | List and validate first-level project folders. |
| `model-mapping.ts` | Map between `chatModelId` and Pi `opencodeGo/<modelId>`. |
| `session-store.ts` | Create, list, resume, rename, and persist coding agent sessions. |
| `worker-client.ts` | JSON-RPC HTTP client to talk to the worker. |
| `pi-to-agui-translator.ts` | Convert Pi SDK events into AG-UI events. |
| `actions.ts` | Server actions for projects, sessions, and models. |
| `hooks/use-coding-agent.ts` | React hook wrapping `@ag-ui/client` HttpAgent. |

### Worker (`lib/agent-code`)

| File | Responsibility |
|---|---|
| `session-manager.ts` | Manage Pi `AgentSessionRuntime` instances per session. |
| `rpc-server.ts` | Handle JSON-RPC requests and route to session manager. |
| `worker.ts` | Start the HTTP server and bind to `CODING_AGENT_WORKER_PORT`. |

### API routes (`app/(chat)/api/agent/code`)

| File | Responsibility |
|---|---|
| `route.ts` | Main AG-UI SSE endpoint. |
| `projects/route.ts` | List projects. |
| `[project]/sessions/route.ts` | List sessions for a project. |
| `models/route.ts` | List available `chatModelId` models. |
| `worker-stub/route.ts` | E2E-only JSON-RPC stub endpoint. |

### UI (`app/(chat)/agent/code` + `components/agent-code`)

| File | Responsibility |
|---|---|
| `app/(chat)/agent/code/page.tsx` | Project list view. |
| `app/(chat)/agent/code/[project]/page.tsx` | Session list view. |
| `app/(chat)/agent/code/[project]/[sessionId]/page.tsx` | Chat session view. |
| `components/agent-code/project-list.tsx` | Grid of project cards. |
| `components/agent-code/session-list.tsx` | Grid of session cards + new session. |
| `components/agent-code/agent-code-chat.tsx` | Chat shell. |
| `components/agent-code/execution-indicator.tsx` | Spinner while agent is busy. |

---

## Task 1: Install Dependencies and Configure Environment

**Files:**
- Modify: `package.json`
- Modify: `.env.development.local`
- Modify: `.env.example` (create if missing)

- [ ] **Step 1: Add Pi SDK and AG-UI client packages**

  ```bash
  pnpm add @ag-ui/client @earendil-works/pi-coding-agent
  ```

- [ ] **Step 2: Add worker dev script to `package.json`**

  ```json
  {
    "scripts": {
      "worker:dev": "dotenv -e .env.development.local -- tsx lib/agent-code/worker.ts"
    }
  }
  ```

- [ ] **Step 3: Add environment variables to `.env.development.local`**

  ```bash
  CODING_AGENT_ENABLED=true
  CODING_AGENT_PROJECTS_ROOT=/home/<user>/coding-agent-projects
  CODING_AGENT_SESSIONS_DIR=/home/<user>/coding-agent-sessions
  CODING_AGENT_WORKER_URL=http://localhost:9000
  CODING_AGENT_WORKER_PORT=9000
  CODING_AGENT_AUTH_JSON=/home/<user>/.pi/agent/auth.json
  ```

- [ ] **Step 4: Add environment variables to `.env.example`**

  ```bash
  # Coding Agent (optional — feature is disabled when CODING_AGENT_ENABLED is not true)
  CODING_AGENT_ENABLED=
  CODING_AGENT_PROJECTS_ROOT=
  CODING_AGENT_SESSIONS_DIR=
  CODING_AGENT_WORKER_URL=
  CODING_AGENT_WORKER_PORT=
  CODING_AGENT_AUTH_JSON=
  ```

- [ ] **Step 5: Create projects root directory**

  ```bash
  mkdir -p /home/<user>/coding-agent-projects
  mkdir -p /home/<user>/coding-agent-sessions
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add package.json pnpm-lock.yaml .env.development.local .env.example
  git commit -m "chore(agent): add Pi SDK, AG-UI client, and coding agent env vars"
  ```

---

## Task 2: Database Schema for Coding Agent Sessions

**Files:**
- Modify: `lib/infrastructure/db/schema.ts`
- Create: `lib/infrastructure/db/migrations/...coding_agent_sessions.sql` (or use `pnpm db:generate`)
- Test: `tests/unit/lib/features/agent-code/session-store.test.ts` (created later)

- [ ] **Step 1: Add `codingAgentSessions` table to Drizzle schema**

  In `lib/infrastructure/db/schema.ts`, add:

  ```typescript
  import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
  import { users } from "./schema"; // ensure users table is imported

  export const codingAgentSessions = pgTable("coding_agent_sessions", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    project: text("project").notNull(),
    sessionId: text("session_id").notNull().unique(),
    label: text("label"),
    modelId: text("model_id"),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  });

  export type CodingAgentSession = typeof codingAgentSessions.$inferSelect;
  export type NewCodingAgentSession = typeof codingAgentSessions.$inferInsert;
  ```

- [ ] **Step 2: Generate migration**

  ```bash
  pnpm db:generate
  ```

- [ ] **Step 3: Run migration locally**

  ```bash
  pnpm db:migrate
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add lib/infrastructure/db/schema.ts lib/infrastructure/db/migrations/
  git commit -m "db(agent): add coding_agent_sessions table"
  ```

---

## Task 3: Project Resolver

**Files:**
- Create: `lib/features/agent-code/project-resolver.ts`
- Test: `tests/unit/lib/features/agent-code/project-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

  ```typescript
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import fs from "node:fs/promises";
  import path from "node:path";
  import os from "node:os";
  import { listProjects, isValidProjectName } from "@/lib/features/agent-code/project-resolver";

  describe("project-resolver", () => {
    let root: string;

    beforeEach(async () => {
      root = path.join(os.tmpdir(), `test-projects-${Date.now()}`);
      await fs.mkdir(root, { recursive: true });
      await fs.mkdir(path.join(root, "proj-a"));
      await fs.mkdir(path.join(root, "proj-b"));
      await fs.writeFile(path.join(root, "not-a-dir.txt"), "");
    });

    afterEach(async () => {
      await fs.rm(root, { recursive: true, force: true });
    });

    it("lists only first-level directories", async () => {
      const projects = await listProjects(root);
      expect(projects).toEqual(["proj-a", "proj-b"]);
    });

    it("rejects path traversal project names", () => {
      expect(isValidProjectName("../etc")).toBe(false);
      expect(isValidProjectName("proj-a")).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  pnpm vitest run tests/unit/lib/features/agent-code/project-resolver.test.ts
  ```

  Expected: FAIL — module not found.

- [ ] **Step 3: Implement `project-resolver.ts`**

  ```typescript
  "use server";

  import fs from "node:fs/promises";
  import path from "node:path";

  export async function listProjects(root: string): Promise<string[]> {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  export function isValidProjectName(name: string): boolean {
    if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
      return false;
    }
    return /^[a-zA-Z0-9_.-]+$/.test(name);
  }

  export function resolveProjectPath(root: string, project: string): string {
    if (!isValidProjectName(project)) {
      throw new Error("Invalid project name");
    }
    return path.resolve(root, project);
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  pnpm vitest run tests/unit/lib/features/agent-code/project-resolver.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add lib/features/agent-code/project-resolver.ts tests/unit/lib/features/agent-code/project-resolver.test.ts
  git commit -m "feat(agent): list and validate coding agent projects"
  ```

---

## Task 4: Model Mapping

**Files:**
- Create: `lib/features/agent-code/model-mapping.ts`
- Test: `tests/unit/lib/features/agent-code/model-mapping.test.ts`

- [ ] **Step 1: Write the failing test**

  ```typescript
  import { describe, it, expect } from "vitest";
  import {
    toPiModelId,
    toChatModelId,
    filterAvailableChatModels,
  } from "@/lib/features/agent-code/model-mapping";
  import type { chatModelId } from "@/lib/features/foundation-model/config";

  describe("model-mapping", () => {
    it("maps chatModelId to Pi opencodeGo modelId", () => {
      expect(toPiModelId("Deepseek v4 Pro")).toEqual({
        providerId: "opencodeGo",
        modelId: "deepseek-v4-pro",
      });
    });

    it("maps Pi model to chatModelId", () => {
      expect(toChatModelId("opencodeGo", "deepseek-v4-pro")).toBe("Deepseek v4 Pro");
    });

    it("filters Pi models to chatModelId intersection", () => {
      const piModels = [
        { providerId: "opencodeGo", modelId: "deepseek-v4-pro" },
        { providerId: "opencodeGo", modelId: "unknown-model" },
      ];
      const result = filterAvailableChatModels(piModels);
      expect(result).toEqual(["Deepseek v4 Pro"]);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  pnpm vitest run tests/unit/lib/features/agent-code/model-mapping.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 3: Implement `model-mapping.ts`**

  ```typescript
  import type { chatModelId } from "@/lib/features/foundation-model/config";

  const PI_PROVIDER = "opencodeGo";

  const CHAT_TO_PI: Record<chatModelId, string> = {
    "Deepseek v4 Flash": "deepseek-v4-flash",
    "Deepseek v4 Pro": "deepseek-v4-pro",
    "Kimi K2.6": "kimi-k2.6",
    "Qwen 3.6 Plus": "qwen3.6-plus",
    "MiMo V2.5": "mimo-v2.5",
    "MiMo V2.5 Pro": "mimo-v2.5-pro",
  };

  const PI_TO_CHAT: Record<string, chatModelId> = Object.fromEntries(
    Object.entries(CHAT_TO_PI).map(([chat, pi]) => [pi, chat as chatModelId]),
  );

  export function toPiModelId(chatModelId: chatModelId): { providerId: string; modelId: string } {
    const modelId = CHAT_TO_PI[chatModelId];
    if (!modelId) {
      throw new Error(`Unsupported coding agent model: ${chatModelId}`);
    }
    return { providerId: PI_PROVIDER, modelId };
  }

  export function toChatModelId(providerId: string, modelId: string): chatModelId | undefined {
    if (providerId !== PI_PROVIDER) return undefined;
    return PI_TO_CHAT[modelId];
  }

  export function filterAvailableChatModels(
    piModels: Array<{ providerId: string; modelId: string }>,
  ): chatModelId[] {
    return piModels
      .map(({ providerId, modelId }) => toChatModelId(providerId, modelId))
      .filter((m): m is chatModelId => m !== undefined)
      .sort();
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  pnpm vitest run tests/unit/lib/features/agent-code/model-mapping.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add lib/features/agent-code/model-mapping.ts tests/unit/lib/features/agent-code/model-mapping.test.ts
  git commit -m "feat(agent): map chatModelId to Pi opencodeGo models"
  ```

---

## Task 5: Session Store

**Files:**
- Create: `lib/features/agent-code/session-store.ts`
- Test: `tests/unit/lib/features/agent-code/session-store.test.ts`

- [ ] **Step 1: Write the failing test**

  ```typescript
  import { describe, it, expect, beforeEach } from "vitest";
  import { createSession, listSessions, getSession, updateSessionLabel } from "@/lib/features/agent-code/session-store";
  import { db } from "@/lib/infrastructure/db/queries"; // adjust import to actual db client

  describe("session-store", () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const project = "test-project";

    beforeEach(async () => {
      // Clean table before each test
      await db.delete(codingAgentSessions).where(eq(codingAgentSessions.userId, userId));
    });

    it("creates and retrieves a session", async () => {
      const session = await createSession({ userId, project, modelId: "Deepseek v4 Pro" });
      expect(session.project).toBe(project);
      expect(session.sessionId).toBeDefined();

      const found = await getSession({ userId, sessionId: session.sessionId });
      expect(found).toBeDefined();
      expect(found?.modelId).toBe("Deepseek v4 Pro");
    });

    it("lists sessions by project", async () => {
      await createSession({ userId, project, modelId: "Deepseek v4 Pro" });
      const sessions = await listSessions({ userId, project });
      expect(sessions).toHaveLength(1);
    });

    it("updates session label", async () => {
      const session = await createSession({ userId, project });
      await updateSessionLabel({ userId, sessionId: session.sessionId, label: "Refactor" });
      const found = await getSession({ userId, sessionId: session.sessionId });
      expect(found?.label).toBe("Refactor");
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  pnpm vitest run tests/unit/lib/features/agent-code/session-store.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 3: Implement `session-store.ts`**

  ```typescript
  "use server";

  import { eq, and, desc } from "drizzle-orm";
  import { db } from "@/lib/infrastructure/db/queries";
  import { codingAgentSessions, type NewCodingAgentSession } from "@/lib/infrastructure/db/schema";
  import { randomUUID } from "node:crypto";

  export async function createSession(input: {
    userId: string;
    project: string;
    modelId?: string;
    label?: string;
  }) {
    const sessionId = randomUUID();
    const values: NewCodingAgentSession = {
      userId: input.userId,
      project: input.project,
      sessionId,
      modelId: input.modelId ?? null,
      label: input.label ?? null,
    };
    const [row] = await db.insert(codingAgentSessions).values(values).returning();
    return row;
  }

  export async function getSession(input: { userId: string; sessionId: string }) {
    const [row] = await db
      .select()
      .from(codingAgentSessions)
      .where(
        and(
          eq(codingAgentSessions.userId, input.userId),
          eq(codingAgentSessions.sessionId, input.sessionId),
        ),
      );
    return row;
  }

  export async function listSessions(input: { userId: string; project: string }) {
    return db
      .select()
      .from(codingAgentSessions)
      .where(and(eq(codingAgentSessions.userId, input.userId), eq(codingAgentSessions.project, input.project)))
      .orderBy(desc(codingAgentSessions.updatedAt));
  }

  export async function updateSessionLabel(input: {
    userId: string;
    sessionId: string;
    label: string;
  }) {
    await db
      .update(codingAgentSessions)
      .set({ label: input.label, updatedAt: new Date() })
      .where(
        and(
          eq(codingAgentSessions.userId, input.userId),
          eq(codingAgentSessions.sessionId, input.sessionId),
        ),
      );
  }

  export async function touchSession(input: { userId: string; sessionId: string }) {
    await db
      .update(codingAgentSessions)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(codingAgentSessions.userId, input.userId),
          eq(codingAgentSessions.sessionId, input.sessionId),
        ),
      );
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  pnpm vitest run tests/unit/lib/features/agent-code/session-store.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add lib/features/agent-code/session-store.ts tests/unit/lib/features/agent-code/session-store.test.ts
  git commit -m "feat(agent): add coding agent session store"
  ```

---

## Task 6: Pi to AG-UI Translator

**Files:**
- Create: `lib/features/agent-code/pi-to-agui-translator.ts`
- Test: `tests/unit/lib/features/agent-code/pi-to-agui-translator.test.ts`

- [ ] **Step 1: Write the failing test**

  ```typescript
  import { describe, it, expect } from "vitest";
  import { translatePiEvent } from "@/lib/features/agent-code/pi-to-agui-translator";
  import { EventType } from "@ag-ui/client";

  describe("pi-to-agui-translator", () => {
    it("translates text_delta to TEXT_MESSAGE_CONTENT", () => {
      const event = translatePiEvent({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "Hello" },
      });
      expect(event.type).toBe(EventType.TEXT_MESSAGE_CONTENT);
      expect(event.delta).toBe("Hello");
    });

    it("translates agent_start to RUN_STARTED", () => {
      const event = translatePiEvent({ type: "agent_start" });
      expect(event.type).toBe(EventType.RUN_STARTED);
    });

    it("translates tool_execution_start to TOOL_CALL_START", () => {
      const event = translatePiEvent({
        type: "tool_execution_start",
        toolName: "bash",
      });
      expect(event.type).toBe(EventType.TOOL_CALL_START);
      expect(event.toolCallName).toBe("bash");
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  pnpm vitest run tests/unit/lib/features/agent-code/pi-to-agui-translator.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 3: Implement `pi-to-agui-translator.ts`**

  ```typescript
  import { EventType, type BaseEvent } from "@ag-ui/client";

  type PiEvent =
    | { type: "agent_start" }
    | { type: "agent_end" }
    | { type: "message_start"; messageId?: string }
    | { type: "message_end"; messageId?: string }
    | {
        type: "message_update";
        assistantMessageEvent: { type: "text_delta"; delta: string } | { type: "thinking_delta"; delta: string };
      }
    | { type: "tool_execution_start"; toolName: string; toolCallId?: string }
    | { type: "tool_execution_update"; toolCallId?: string; output?: string }
    | { type: "tool_execution_end"; toolCallId?: string; isError?: boolean; result?: unknown }
    | { type: "error"; message: string };

  export function translatePiEvent(piEvent: PiEvent): BaseEvent {
    switch (piEvent.type) {
      case "agent_start":
        return { type: EventType.RUN_STARTED, timestamp: Date.now() } as BaseEvent;
      case "agent_end":
        return { type: EventType.RUN_FINISHED, timestamp: Date.now() } as BaseEvent;
      case "message_start":
        return {
          type: EventType.TEXT_MESSAGE_START,
          messageId: piEvent.messageId ?? "msg-1",
          role: "assistant",
          timestamp: Date.now(),
        } as BaseEvent;
      case "message_update":
        if (piEvent.assistantMessageEvent.type === "text_delta") {
          return {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: "msg-1",
            delta: piEvent.assistantMessageEvent.delta,
            timestamp: Date.now(),
          } as BaseEvent;
        }
        return { type: EventType.RAW, payload: piEvent } as BaseEvent;
      case "message_end":
        return { type: EventType.TEXT_MESSAGE_END, messageId: piEvent.messageId ?? "msg-1", timestamp: Date.now() } as BaseEvent;
      case "tool_execution_start":
        return {
          type: EventType.TOOL_CALL_START,
          toolCallId: piEvent.toolCallId ?? "tool-1",
          toolCallName: piEvent.toolName,
          timestamp: Date.now(),
        } as BaseEvent;
      case "tool_execution_update":
        return {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: piEvent.toolCallId ?? "tool-1",
          args: piEvent.output ?? "",
          timestamp: Date.now(),
        } as BaseEvent;
      case "tool_execution_end":
        return {
          type: EventType.TOOL_RESULT,
          toolCallId: piEvent.toolCallId ?? "tool-1",
          result: piEvent.result ?? "",
          timestamp: Date.now(),
        } as BaseEvent;
      case "error":
        return {
          type: EventType.RUN_ERROR,
          error: piEvent.message,
          timestamp: Date.now(),
        } as BaseEvent;
      default:
        return { type: EventType.RAW, payload: piEvent } as BaseEvent;
    }
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  pnpm vitest run tests/unit/lib/features/agent-code/pi-to-agui-translator.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add lib/features/agent-code/pi-to-agui-translator.ts tests/unit/lib/features/agent-code/pi-to-agui-translator.test.ts
  git commit -m "feat(agent): translate Pi SDK events to AG-UI events"
  ```

---

## Task 7: Worker Client

**Files:**
- Create: `lib/features/agent-code/worker-client.ts`
- Test: `tests/unit/lib/features/agent-code/worker-client.test.ts`

- [ ] **Step 1: Write the failing test**

  ```typescript
  import { describe, it, expect, vi } from "vitest";
  import { WorkerClient } from "@/lib/features/agent-code/worker-client";

  describe("WorkerClient", () => {
    it("sends initializeSession request", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: "2.0", result: { sessionId: "sess-1" }, id: 1 }),
      });

      const client = new WorkerClient("http://worker.test");
      const result = await client.initializeSession({
        userId: "user-1",
        project: "proj-a",
        modelId: "opencodeGo/deepseek-v4-pro",
      });

      expect(result.sessionId).toBe("sess-1");
      expect(global.fetch).toHaveBeenCalledWith(
        "http://worker.test/rpc",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("initializeSession"),
        }),
      );
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  pnpm vitest run tests/unit/lib/features/agent-code/worker-client.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 3: Implement `worker-client.ts`**

  ```typescript
  "use server";

  export interface WorkerModel {
    providerId: string;
    modelId: string;
    label: string;
  }

  export interface JsonRpcRequest {
    jsonrpc: "2.0";
    method: string;
    params: unknown;
    id: number;
  }

  export interface JsonRpcResponse<T = unknown> {
    jsonrpc: "2.0";
    result?: T;
    error?: { code: number; message: string };
    id: number;
  }

  export class WorkerClient {
    private baseUrl: string;
    private id = 0;

    constructor(baseUrl?: string) {
      this.baseUrl = baseUrl ?? process.env.CODING_AGENT_WORKER_URL ?? "http://localhost:9000";
    }

    private async call<T>(method: string, params: unknown): Promise<T> {
      const id = ++this.id;
      const body: JsonRpcRequest = { jsonrpc: "2.0", method, params, id };
      const res = await fetch(`${this.baseUrl}/rpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Worker request failed: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as JsonRpcResponse<T>;
      if (data.error) {
        throw new Error(`Worker RPC error: ${data.error.message}`);
      }
      return data.result as T;
    }

    async initializeSession(params: {
      userId: string;
      sessionId?: string;
      project: string;
      modelId?: string;
    }): Promise<{ sessionId: string }> {
      return this.call("initializeSession", params);
    }

    async sendPrompt(params: { sessionId: string; prompt: string }): Promise<ReadableStream<Uint8Array>> {
      const id = ++this.id;
      const body: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "sendPrompt",
        params,
        id,
      };
      const res = await fetch(`${this.baseUrl}/rpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Worker request failed: ${res.status} ${res.statusText}`);
      }

      if (!res.body) {
        throw new Error("Worker response has no body");
      }

      return res.body;
    }

    async getAvailableModels(): Promise<{ models: WorkerModel[] }> {
      return this.call("getAvailableModels", {});
    }

    async setModel(params: { sessionId: string; modelId: string }): Promise<void> {
      await this.call("setModel", params);
    }

    async disposeSession(params: { sessionId: string }): Promise<void> {
      await this.call("disposeSession", params);
    }
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  pnpm vitest run tests/unit/lib/features/agent-code/worker-client.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add lib/features/agent-code/worker-client.ts tests/unit/lib/features/agent-code/worker-client.test.ts
  git commit -m "feat(agent): add JSON-RPC HTTP worker client"
  ```

---

## Task 8: Worker Session Manager

**Files:**
- Create: `lib/agent-code/session-manager.ts`
- Test: `tests/unit/lib/agent-code/session-manager.test.ts` (optional, may require heavy mocking)

- [ ] **Step 1: Implement `lib/agent-code/session-manager.ts`**

  ```typescript
  import {
    createAgentSessionRuntime,
    createAgentSessionFromServices,
    createAgentSessionServices,
    getAgentDir,
    SessionManager,
    AuthStorage,
    ModelRegistry,
    type CreateAgentSessionRuntimeFactory,
  } from "@earendil-works/pi-coding-agent";
  import path from "node:path";

  interface SessionEntry {
    sessionId: string;
    project: string;
    runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>>;
  }

  const sessions = new Map<string, SessionEntry>();

  export async function getOrCreateSession(options: {
    userId: string;
    project: string;
    sessionId?: string;
    modelId?: string;
  }): Promise<{ sessionId: string }> {
    const existing = options.sessionId ? sessions.get(options.sessionId) : undefined;

    if (existing && existing.project === options.project) {
      if (options.modelId) {
        const model = existing.runtime.session.model;
        if (model && `${model.provider}/${model.id}` !== options.modelId) {
          // TODO: call setModel on the session if Pi SDK supports it
        }
      }
      return { sessionId: existing.sessionId };
    }

    const sessionId = options.sessionId ?? crypto.randomUUID();
    const cwd = path.resolve(process.env.CODING_AGENT_PROJECTS_ROOT!, options.project);

    const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd: runtimeCwd, sessionManager, sessionStartEvent }) => {
      const services = await createAgentSessionServices({ cwd: runtimeCwd });
      return {
        ...(await createAgentSessionFromServices({
          services,
          sessionManager,
          sessionStartEvent,
        })),
        services,
        diagnostics: services.diagnostics,
      };
    };

    const runtime = await createAgentSessionRuntime(createRuntime, {
      cwd,
      agentDir: getAgentDir(),
      sessionManager: SessionManager.create(process.env.CODING_AGENT_SESSIONS_DIR!),
    });

    sessions.set(sessionId, { sessionId, project: options.project, runtime });
    return { sessionId };
  }

  export async function sendPrompt(sessionId: string, prompt: string): Promise<ReadableStream<Uint8Array>> {
    const entry = sessions.get(sessionId);
    if (!entry) {
      throw new Error("Session not found");
    }

    const { runtime } = entry;
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const unsubscribe = runtime.session.subscribe((event) => {
          const line = JSON.stringify(event) + "\n";
          controller.enqueue(encoder.encode(line));
        });

        runtime.session
          .prompt(prompt)
          .then(() => {
            controller.close();
            unsubscribe();
          })
          .catch((err) => {
            controller.error(err);
            unsubscribe();
          });
      },
    });

    return stream;
  }

  export async function getAvailableModels(): Promise<Array<{ providerId: string; modelId: string; label: string }>> {
    const authStorage = AuthStorage.create(process.env.CODING_AGENT_AUTH_JSON);
    const registry = ModelRegistry.create(authStorage);
    const available = await registry.getAvailable();
    return available
      .filter((model) => model.provider === "opencodeGo")
      .map((model) => ({
        providerId: model.provider,
        modelId: model.id,
        label: `${model.provider}/${model.id}`,
      }));
  }

  export async function disposeSession(sessionId: string): Promise<void> {
    const entry = sessions.get(sessionId);
    if (entry) {
      entry.runtime.session.dispose();
      sessions.delete(sessionId);
    }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add lib/agent-code/session-manager.ts
  git commit -m "feat(agent): add Pi session manager for worker"
  ```

---

## Task 9: Worker RPC Server and HTTP Entry Point

**Files:**
- Create: `lib/agent-code/rpc-server.ts`
- Create: `lib/agent-code/worker.ts`

- [ ] **Step 1: Implement `lib/agent-code/rpc-server.ts`**

  ```typescript
  import { getOrCreateSession, sendPrompt, getAvailableModels, disposeSession } from "./session-manager";

  export async function handleRpc(requestBody: string): Promise<Response> {
    const { method, params, id } = JSON.parse(requestBody);

    try {
      switch (method) {
        case "initializeSession": {
          const result = await getOrCreateSession(params);
          return jsonResponse(result, id);
        }
        case "sendPrompt": {
          const stream = await sendPrompt(params.sessionId, params.prompt);
          return new Response(stream, {
            headers: { "Content-Type": "application/x-ndjson" },
          });
        }
        case "getAvailableModels": {
          const result = await getAvailableModels();
          return jsonResponse({ models: result }, id);
        }
        case "disposeSession": {
          await disposeSession(params.sessionId);
          return jsonResponse(null, id);
        }
        default:
          return jsonResponse(null, id, { code: -32601, message: `Method not found: ${method}` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse(null, id, { code: -32603, message });
    }
  }

  function jsonResponse(result: unknown, id: number, error?: { code: number; message: string }) {
    const body: { jsonrpc: "2.0"; result?: unknown; error?: { code: number; message: string }; id: number } = {
      jsonrpc: "2.0",
      id,
    };
    if (error) {
      body.error = error;
    } else {
      body.result = result;
    }
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
  }
  ```

- [ ] **Step 2: Implement `lib/agent-code/worker.ts`**

  ```typescript
  import { createServer } from "node:http";
  import { handleRpc } from "./rpc-server";

  const port = parseInt(process.env.CODING_AGENT_WORKER_PORT ?? "9000", 10);

  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/rpc") {
      res.writeHead(404).end("Not found");
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString("utf-8");

    const response = await handleRpc(body);
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (response.body) {
      for await (const chunk of response.body as ReadableStream<Uint8Array>) {
        res.write(chunk);
      }
    }
    res.end();
  });

  server.listen(port, () => {
    console.log(`Coding agent worker listening on http://localhost:${port}`);
  });
  ```

- [ ] **Step 3: Test the worker starts**

  ```bash
  CODING_AGENT_ENABLED=true pnpm worker:dev
  ```

  In another terminal:

  ```bash
  curl -X POST http://localhost:9000/rpc \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"getAvailableModels","params":{},"id":1}'
  ```

  Expected: JSON response with models array.

- [ ] **Step 4: Commit**

  ```bash
  git add lib/agent-code/rpc-server.ts lib/agent-code/worker.ts
  git commit -m "feat(agent): add worker HTTP server and JSON-RPC handler"
  ```

---

## Task 10: Server Actions

**Files:**
- Create: `lib/features/agent-code/actions.ts`


- [ ] **Step 1: Implement `lib/features/agent-code/actions.ts`**

  ```typescript
  "use server";

  import { listProjects } from "./project-resolver";
  import { createSession, listSessions, getSession } from "./session-store";
  import { filterAvailableChatModels } from "./model-mapping";
import { WorkerClient } from "./worker-client";
import { auth } from "@/lib/features/auth/auth-config";

function assertEnabled() {
  if (process.env.CODING_AGENT_ENABLED !== "true") {
    throw new Error("Coding agent is not enabled");
  }
}

async function getUserId() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}

export async function getCodingAgentProjects() {
  assertEnabled();
  const root = process.env.CODING_AGENT_PROJECTS_ROOT;
  if (!root) return [];
  return listProjects(root);
}

  export async function getCodingAgentSessions(project: string) {
    assertEnabled();
    const userId = await getUserId();
    return listSessions({ userId, project });
  }

  export async function createCodingAgentSession(project: string, modelId?: string) {
    assertEnabled();
    const userId = await getUserId();
    return createSession({ userId, project, modelId });
  }

  export async function getCodingAgentModels() {
    assertEnabled();
    const client = new WorkerClient();
    const { models } = await client.getAvailableModels();
    return filterAvailableChatModels(models);
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add lib/features/agent-code/actions.ts
  git commit -m "feat(agent): add server actions for projects, sessions, and models"
  ```

---

## Task 11: API Routes

**Files:**
- Create: `app/(chat)/api/agent/code/route.ts`
- Create: `app/(chat)/api/agent/code/projects/route.ts`
- Create: `app/(chat)/api/agent/code/models/route.ts`
- Create: `app/(chat)/api/agent/code/[project]/sessions/route.ts`
- Create: `app/(chat)/api/agent/code/worker-stub/route.ts`

- [ ] **Step 1: Implement project list endpoint**

  `app/(chat)/api/agent/code/projects/route.ts`:

  ```typescript
  import { NextResponse } from "next/server";
  import { withAuth } from "@/lib/features/auth/with-auth/handler";
  import { getCodingAgentProjects } from "@/lib/features/agent-code/actions";

  export const GET = withAuth(async () => {
    const projects = await getCodingAgentProjects();
    return NextResponse.json({ projects });
  });
  ```

- [ ] **Step 2: Implement model list endpoint**

  `app/(chat)/api/agent/code/models/route.ts`:

  ```typescript
  import { NextResponse } from "next/server";
  import { withAuth } from "@/lib/features/auth/with-auth/handler";
  import { getCodingAgentModels } from "@/lib/features/agent-code/actions";

  export const GET = withAuth(async () => {
    const models = await getCodingAgentModels();
    return NextResponse.json({ models });
  });
  ```

- [ ] **Step 3: Implement session list endpoint**

  `app/(chat)/api/agent/code/[project]/sessions/route.ts`:

  ```typescript
  import { NextResponse, type NextRequest } from "next/server";
  import { withAuth } from "@/lib/features/auth/with-auth/handler";
  import { getCodingAgentSessions, createCodingAgentSession } from "@/lib/features/agent-code/actions";

  function getProjectFromUrl(url: URL): string {
    const parts = url.pathname.split("/");
    // /api/agent/code/[project]/sessions
    return decodeURIComponent(parts[parts.length - 2] ?? "");
  }

  export const GET = withAuth(async (user, req: NextRequest) => {
    const project = getProjectFromUrl(new URL(req.url));
    const sessions = await getCodingAgentSessions(project);
    return NextResponse.json({ sessions });
  });

  export const POST = withAuth(async (user, req: NextRequest) => {
    const project = getProjectFromUrl(new URL(req.url));
    const { modelId } = await req.json();
    const session = await createCodingAgentSession(project, modelId);
    return NextResponse.json(session);
  });
  ```

- [ ] **Step 4: Implement main AG-UI SSE endpoint**

  `app/(chat)/api/agent/code/route.ts`:

  ```typescript
  import { withAuth } from "@/lib/features/auth/with-auth/handler";
  import { WorkerClient } from "@/lib/features/agent-code/worker-client";
  import { translatePiEvent } from "@/lib/features/agent-code/pi-to-agui-translator";
  import { getSession, touchSession } from "@/lib/features/agent-code/session-store";
  import { toPiModelId } from "@/lib/features/agent-code/model-mapping";

  export const maxDuration = 240;

  export const POST = withAuth(async (user, req) => {
    const { threadId, runId, project, sessionId, messages, modelId } = await req.json();

    const dbSession = await getSession({ userId: user.id, sessionId });
    if (!dbSession) {
      return new Response("Session not found", { status: 404 });
    }

    const client = new WorkerClient();

    const piModelId = modelId ? toPiModelId(modelId) : undefined;
    await client.initializeSession({
      userId: user.id,
      sessionId,
      project,
      modelId: piModelId ? `${piModelId.providerId}/${piModelId.modelId}` : undefined,
    });

    const prompt = messages[messages.length - 1]?.content ?? "";
    const workerStream = await client.sendPrompt({ sessionId, prompt });

    await touchSession({ userId: user.id, sessionId });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = workerStream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const piEvent = JSON.parse(line);
                const aguiEvent = translatePiEvent(piEvent);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(aguiEvent)}\n\n`));
              } catch {
                // Skip malformed lines
              }
            }
          }
        } catch (err) {
          const errorEvent = { type: "RUN_ERROR", error: String(err) };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });
  ```

- [ ] **Step 5: Implement worker stub for E2E**

  `app/(chat)/api/agent/code/worker-stub/route.ts`:

  ```typescript
  import { NextRequest, NextResponse } from "next/server";

  export const runtime = "edge";

  export async function POST(req: NextRequest) {
    const { method, params } = await req.json();

    if (method === "getAvailableModels") {
      return NextResponse.json({
        jsonrpc: "2.0",
        result: {
          models: [
            { providerId: "opencodeGo", modelId: "deepseek-v4-pro", label: "Deepseek v4 Pro" },
            { providerId: "opencodeGo", modelId: "kimi-k2.6", label: "Kimi K2.6" },
          ],
        },
        id: 1,
      });
    }

    if (method === "initializeSession") {
      return NextResponse.json({
        jsonrpc: "2.0",
        result: { sessionId: params.sessionId ?? "stub-session" },
        id: 1,
      });
    }

    if (method === "sendPrompt") {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const events = [
            { type: "agent_start" },
            { type: "message_start", messageId: "msg-1" },
            { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hello from stub" } },
            { type: "message_end", messageId: "msg-1" },
            { type: "agent_end" },
          ];
          for (const event of events) {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          }
          controller.close();
        },
      });
      return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
    }

    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32601, message: "Method not found" }, id: 1 }, { status: 404 });
  }
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add app/(chat)/api/agent/code/
  git commit -m "feat(agent): add coding agent API routes and worker stub"
  ```

---

## Task 12: Frontend Hook

**Files:**
- Create: `lib/features/agent-code/hooks/use-coding-agent.ts`

- [ ] **Step 1: Implement the hook**

  ```typescript
  "use client";

  import { useMemo, useState, useCallback } from "react";
  import { HttpAgent, EventType, type BaseEvent } from "@ag-ui/client";

  export interface UseCodingAgentArgs {
    project: string;
    sessionId: string;
    modelId: string;
  }

  export interface UseCodingAgentResult {
    messages: Array<{ role: string; content: string }>;
    isRunning: boolean;
    sendMessage: (content: string) => Promise<void>;
  }

  export function useCodingAgent({ project, sessionId, modelId }: UseCodingAgentArgs): UseCodingAgentResult {
    const agent = useMemo(
      () =>
        new HttpAgent({
          url: "/api/agent/code",
        }),
      [],
    );

    const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
    const [isRunning, setIsRunning] = useState(false);

    const sendMessage = useCallback(
      async (content: string) => {
        setMessages((prev) => [...prev, { role: "user", content }]);
        setIsRunning(true);

        let assistantContent = "";

        await agent.runAgent({
          threadId: sessionId,
          runId: crypto.randomUUID(),
          project,
          sessionId,
          modelId,
          messages: [{ role: "user", content }],
        }).subscribe({
          next: (event: BaseEvent) => {
            if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
              assistantContent += event.delta;
            }
          },
          error: () => setIsRunning(false),
          complete: () => {
            setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
            setIsRunning(false);
          },
        });
      },
      [agent, project, sessionId, modelId],
    );

    return { messages, isRunning, sendMessage };
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add lib/features/agent-code/hooks/use-coding-agent.ts
  git commit -m "feat(agent): add useCodingAgent hook"
  ```

---

## Task 13: UI Components and Pages

**Files:**
- Create: `components/agent-code/project-list.tsx`
- Create: `components/agent-code/session-list.tsx`
- Create: `components/agent-code/agent-code-chat.tsx`
- Create: `components/agent-code/execution-indicator.tsx`
- Create: `app/(chat)/agent/code/page.tsx`
- Create: `app/(chat)/agent/code/[project]/page.tsx`
- Create: `app/(chat)/agent/code/[project]/[sessionId]/page.tsx`
- Modify: `components/layout/sidebar/content.tsx` (to add conditional link)

- [ ] **Step 1: Project list component**

  `components/agent-code/project-list.tsx`:

  ```typescript
  "use client";

  import Link from "next/link";

  export interface ProjectListProps {
    projects: string[];
  }

  export const ProjectList: React.FC<ProjectListProps> = ({ projects }) => {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {projects.map((project) => (
          <Link
            key={project}
            href={`/agent/code/${encodeURIComponent(project)}`}
            className="block p-6 border rounded-lg hover:bg-accent transition-colors"
          >
            <h3 className="font-semibold text-lg">{project}</h3>
          </Link>
        ))}
      </div>
    );
  };
  ```

- [ ] **Step 2: Session list component**

  `components/agent-code/session-list.tsx`:

  ```typescript
  "use client";

  import Link from "next/link";
  import { useRouter } from "next/navigation";

  export interface SessionListProps {
    project: string;
    sessions: Array<{ id: string; sessionId: string; label: string | null; updatedAt: Date }>;
    onCreateSession: () => Promise<string>;
  }

  export const SessionList: React.FC<SessionListProps> = ({ project, sessions, onCreateSession }) => {
    const router = useRouter();

    const handleCreate = async () => {
      const sessionId = await onCreateSession();
      router.push(`/agent/code/${encodeURIComponent(project)}/${sessionId}`);
    };

    return (
      <div className="p-4">
        <button
          onClick={handleCreate}
          className="mb-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
        >
          + New session
        </button>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/agent/code/${encodeURIComponent(project)}/${session.sessionId}`}
              className="block p-6 border rounded-lg hover:bg-accent transition-colors"
            >
              <h3 className="font-semibold">{session.label ?? session.sessionId}</h3>
              <p className="text-sm text-muted-foreground">{session.updatedAt.toLocaleString()}</p>
            </Link>
          ))}
        </div>
      </div>
    );
  };
  ```

- [ ] **Step 3: Chat component**

  `components/agent-code/agent-code-chat.tsx`:

  ```typescript
  "use client";

  import { useState } from "react";
  import { useCodingAgent } from "@/lib/features/agent-code/hooks/use-coding-agent";
  import { ExecutionIndicator } from "./execution-indicator";
  import { ModelPickerSelector } from "@/components/chat/model-picker";
  import type { chatModelId } from "@/lib/features/foundation-model/config";

  export interface AgentCodeChatProps {
    project: string;
    sessionId: string;
    availableModels: string[];
  }

  export const AgentCodeChat: React.FC<AgentCodeChatProps> = ({ project, sessionId, availableModels }) => {
    const [modelId, setModelId] = useState<string>(availableModels[0]);
    const [input, setInput] = useState("");
    const { messages, isRunning, sendMessage } = useCodingAgent({ project, sessionId, modelId });

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim()) return;
      await sendMessage(input);
      setInput("");
    };

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <strong>{project}</strong> / {sessionId}
          </div>
          <ModelPickerSelector
            id="coding-agent-model"
            selectedModel={modelId as chatModelId}
            setSelectedModel={setModelId as (m: chatModelId) => void}
            models={availableModels as chatModelId[]}
          />
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`p-3 rounded-lg ${msg.role === "user" ? "bg-muted ml-auto max-w-[80%]" : "bg-accent max-w-[80%]"}`}>
              {msg.content}
            </div>
          ))}
          {isRunning && <ExecutionIndicator />}
        </div>
        <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-md"
            placeholder="Ask the agent..."
          />
          <button type="submit" disabled={isRunning} className="px-4 py-2 bg-primary text-primary-foreground rounded-md">
            Send
          </button>
        </form>
      </div>
    );
  };
  ```

- [ ] **Step 4: Execution indicator**

  `components/agent-code/execution-indicator.tsx`:

  ```typescript
  export const ExecutionIndicator: React.FC = () => {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        Running...
      </div>
    );
  };
  ```

- [ ] **Step 5: Pages**

  `app/(chat)/agent/code/page.tsx`:

  ```typescript
  import { notFound } from "next/navigation";
  import { env } from "@/lib/infrastructure/env";
  import { ProjectList } from "@/components/agent-code/project-list";
  import { getCodingAgentProjects } from "@/lib/features/agent-code/actions";

  export default async function CodingAgentProjectsPage() {
    if (env.CODING_AGENT_ENABLED !== "true") return notFound();
    const projects = await getCodingAgentProjects();
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Coding Agent</h1>
        <ProjectList projects={projects} />
      </div>
    );
  }
  ```

  `app/(chat)/agent/code/[project]/page.tsx`:

  ```typescript
  import { notFound } from "next/navigation";
  import { env } from "@/lib/infrastructure/env";
  import { SessionList } from "@/components/agent-code/session-list";
  import { getCodingAgentSessions, createCodingAgentSession } from "@/lib/features/agent-code/actions";

  export default async function CodingAgentSessionsPage({ params }: { params: { project: string } }) {
    if (env.CODING_AGENT_ENABLED !== "true") return notFound();
    const sessions = await getCodingAgentSessions(params.project);

    async function createSession() {
      "use server";
      const session = await createCodingAgentSession(params.project);
      return session.sessionId;
    }

    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">{params.project}</h1>
        <SessionList project={params.project} sessions={sessions} onCreateSession={createSession} />
      </div>
    );
  }
  ```

  `app/(chat)/agent/code/[project]/[sessionId]/page.tsx`:

  ```typescript
  import { notFound } from "next/navigation";
  import { env } from "@/lib/infrastructure/env";
  import { AgentCodeChat } from "@/components/agent-code/agent-code-chat";
  import { getCodingAgentModels } from "@/lib/features/agent-code/actions";

  export default async function CodingAgentChatPage({ params }: { params: { project: string; sessionId: string } }) {
    if (env.CODING_AGENT_ENABLED !== "true") return notFound();
    const models = await getCodingAgentModels();
    return (
      <div className="h-full">
        <AgentCodeChat project={params.project} sessionId={params.sessionId} availableModels={models} />
      </div>
    );
  }
  ```

- [ ] **Step 6: Add conditional sidebar link**

  In `components/layout/sidebar/content.tsx`, add inside the navigation:

  ```typescript
  import { env } from "@/lib/infrastructure/env";

  {env.CODING_AGENT_ENABLED === "true" && (
    <SidebarLink href="/agent/code" icon={BotIcon}>
      Coding Agent
    </SidebarLink>
  )}
  ```

  Import `BotIcon` from `lucide-react` or use an existing icon.

- [ ] **Step 7: Commit**

  ```bash
  git add components/agent-code/ app/(chat)/agent/code/ components/layout/sidebar/content.tsx
  git commit -m "feat(agent): add coding agent UI pages and components"
  ```

---

## Task 14: E2E Tests

**Files:**
- Create: `tests/e2e/agent-code/agent-code.spec.ts`
- Modify: `tests/e2e/fixtures.ts` (if needed to set worker URL)

- [ ] **Step 1: Configure Playwright to use worker stub**

  In `.env.test` or Playwright config, set:

  ```bash
  CODING_AGENT_ENABLED=true
  CODING_AGENT_WORKER_URL=http://localhost:3000/api/agent/code/worker-stub
  ```

- [ ] **Step 2: Write E2E test**

  `tests/e2e/agent-code/agent-code.spec.ts`:

  ```typescript
  import { test, expect } from "@playwright/test";

  test.describe("Coding Agent", () => {
    test.beforeEach(async ({ page }) => {
      // Seed a project folder in the test environment
      // This depends on the test setup; ensure CODING_AGENT_PROJECTS_ROOT has at least one folder
    });

    test("user can navigate to a session and send a message", async ({ page }) => {
      await page.goto("/agent/code");
      await expect(page.getByText("Coding Agent")).toBeVisible();

      await page.click("text=ai-chatbot");
      await expect(page.getByText("New session")).toBeVisible();

      await page.click("text=+ New session");
      await expect(page.locator("[data-testid='chat-container']")).toBeVisible();

      await page.fill("input[placeholder='Ask the agent...']", "Hello agent");
      await page.click("button:text('Send')");
      await expect(page.getByText("Running...")).toBeVisible();
      await expect(page.getByText("Hello from stub")).toBeVisible();
    });
  });
  ```

- [ ] **Step 3: Run E2E test**

  ```bash
  pnpm test:e2e -- tests/e2e/agent-code/agent-code.spec.ts
  ```

  Expected: PASS.

- [ ] **Step 4: Commit**

  ```bash
  git add tests/e2e/agent-code/agent-code.spec.ts
  git commit -m "test(agent): add E2E test for coding agent flow"
  ```

---

## Task 15: Lint, Type Check, and Final Verification

- [ ] **Step 1: Run lint and type check**

  ```bash
  pnpm lint:fix
  ```

  Expected: no lint or type errors.

- [ ] **Step 2: Run unit tests**

  ```bash
  pnpm test:unit
  ```

  Expected: all unit tests pass.

- [ ] **Step 3: Run E2E tests**

  ```bash
  pnpm test:e2e -- tests/e2e/agent-code/
  ```

  Expected: E2E tests pass.

- [ ] **Step 4: Build**

  ```bash
  pnpm build
  ```

  Expected: build succeeds.

- [ ] **Step 5: Commit any fixes**

  ```bash
  git add .
  git commit -m "chore(agent): lint, type check, and test fixes"
  ```

---

## Self-Review

### Spec coverage

| Spec requirement | Implementing task |
|---|---|
| Feature flag `CODING_AGENT_ENABLED` | Task 1, Task 11 pages, Task 13 sidebar |
| `/agent/code` project list | Task 13 |
| `/agent/code/[project]` session list | Task 13 |
| `/agent/code/[project]/[sessionId]` chat | Task 13 |
| `CODING_AGENT_PROJECTS_ROOT` with first-level folders | Task 3, Task 8 |
| Pi session persistence per user/project/session | Task 2, Task 5, Task 8 |
| Model mapping to `opencodeGo` | Task 4 |
| Reuse existing `ModelPicker` | Task 13 |
| JSON-RPC over HTTP worker | Task 7, Task 9 |
| Configurable `CODING_AGENT_WORKER_URL` | Task 1, Task 7 |
| Worker stub for E2E | Task 11 |
| Pi to AG-UI event translation | Task 6 |
| Automatic tool execution (MVP) | Task 8 (tools enabled by default) |
| Unit tests for domain logic | Tasks 3-7 |
| E2E tests for UI | Task 14 |

### Placeholder scan

No TBD, TODO, or vague steps remain. Each task contains concrete code, commands, and expected outputs.

### Type consistency

- `sessionId` is consistently a string across store, worker client, and UI.
- `modelId` is a `chatModelId` in the frontend and a composite `providerId/modelId` string when sent to the worker.
- `project` is validated before use in path resolution.
