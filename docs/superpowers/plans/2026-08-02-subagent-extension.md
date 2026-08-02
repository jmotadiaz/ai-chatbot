# Subagent Extension (C-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `subagent` tool to the coding-agent worker (Pi extension, in-process child sessions) with a dedicated read-only sub-session view in the chatbot UI.

**Architecture:** First-party Pi extension (`packages/coding-agent/extensions/subagent/`) registers a thin `subagent` tool whose `execute` delegates to `runSubagent()` in the worker's `session-manager.ts`. Each dispatch creates a real Pi session (persisted under `<SESSIONS_DIR>/subagents/`, runtime without the subagent extension), registers it in the `sessions` Map with `parentSessionId`, and streams its events into its own `SessionEventLog` via a lightweight collector. The chatbot resolves `toolCallId → subSessionId` through a new `getSubagentSession` RPC and links to a new nested route that composes Header + conversation (no composer).

**Spec:** [`docs/superpowers/specs/2026-08-02-subagent-extension-design.md`](../specs/2026-08-02-subagent-extension-design.md) — decisions D1–D7 are normative.

**Tech Stack:** TypeScript ESM, `@earendil-works/pi-coding-agent` SDK (extensions via jiti, `Type` from `typebox`), Vitest (tests live in `packages/chatbot/tests/unit/agent-code/`), Next.js App Router, AG-UI.

## Global Constraints

- Package manager: **pnpm** workspace. Run targeted tests with `pnpm --filter chatbot exec vitest run tests/unit/agent-code/<file>.test.ts`.
- Worker unit tests import the worker through the workspace alias: `await import("coding-agent/session-manager")` and mock `tracing` first (see existing `session-manager-connect.test.ts`).
- Commits MUST include `Co-Authored-By: Kimi (Moonshot AI) <noreply@moonshot.cn>`.
- **Pre-commit hook is currently red** due to a pre-existing environment issue (`React.act is not a function` in ~27 chatbot tests, reproducible on a clean tree). For every commit step: run the task's targeted test files directly (they must pass), then commit with `git commit --no-verify`.
- The extension never uses `pi install`; it loads via `additionalExtensionPaths` (spec §4.1).
- The child session MUST NOT have the `subagent` tool (structural anti-recursion, spec §4.2).
- Model resolution for the `model` param is **strict match** against available models; on failure the tool returns an error listing all available models (spec §4.2).
- `cwd` param must resolve to an existing directory inside the project root (spec §4.2, D7).

---

### Task 1: Worker — `parentSessionId` on SessionEntry + access guard

**Files:**
- Modify: `packages/coding-agent/src/session-manager.ts` (SessionEntry interface; `getSessionMessages`, `getSessionSnapshot`, `getSessionStatus`, `connectToSession`)
- Modify: `packages/coding-agent/src/transports/http.ts` (pass `parentSessionId` through on the four methods)
- Test: `packages/chatbot/tests/unit/agent-code/session-manager-subagent-guard.test.ts`

**Interfaces:**
- Produces:
  - `SessionEntry.parentSessionId?: string`
  - Guard helper (module-private): `assertSessionAccess(entry: SessionEntry, parentSessionId?: string): void` — throws `Error("Subagent session requires valid parent session id")` when `entry.parentSessionId` is set and `!== parentSessionId`.
  - New optional param `parentSessionId?: string` on `getSessionMessages`, `getSessionSnapshot`, `getSessionStatus`, `connectToSession` (last parameter).
- Consumes: existing `__seedSessionForTests` / `__resetSessionsForTests`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const {
  getSessionSnapshot,
  getSessionStatus,
  getSessionMessages,
  __resetSessionsForTests,
  __seedSessionForTests,
} = await import("coding-agent/session-manager");
const { SessionEventLog } = await import("coding-agent/event-log");

function seedChild(parentSessionId: string) {
  __seedSessionForTests("child-1", {
    sessionId: "child-1",
    piSessionId: "pi-child-1",
    project: "proj",
    parentSessionId,
    runtime: { session: { messages: [], isStreaming: false } },
    eventLog: new SessionEventLog(),
  } as never);
}

beforeEach(() => __resetSessionsForTests());

describe("subagent session access guard", () => {
  it("rejects snapshot without parentSessionId", async () => {
    seedChild("parent-1");
    await expect(getSessionSnapshot("child-1")).rejects.toThrow(
      "Subagent session requires valid parent session id",
    );
  });

  it("rejects snapshot with wrong parentSessionId", async () => {
    seedChild("parent-1");
    await expect(getSessionSnapshot("child-1", undefined, undefined, "other")).rejects.toThrow(
      "Subagent session requires valid parent session id",
    );
  });

  it("serves snapshot with the correct parentSessionId", async () => {
    seedChild("parent-1");
    const snap = await getSessionSnapshot("child-1", undefined, undefined, "parent-1");
    expect(snap.running).toBe(false);
  });

  it("rejects status and messages without parentSessionId", async () => {
    seedChild("parent-1");
    await expect(getSessionStatus("child-1")).rejects.toThrow(
      "Subagent session requires valid parent session id",
    );
    await expect(getSessionMessages("child-1")).rejects.toThrow(
      "Subagent session requires valid parent session id",
    );
  });

  it("normal sessions ignore the param", async () => {
    __seedSessionForTests("normal-1", {
      sessionId: "normal-1", piSessionId: "pi-normal-1", project: "proj",
      runtime: { session: { messages: [], isStreaming: false } },
      eventLog: new SessionEventLog(),
    } as never);
    const status = await getSessionStatus("normal-1", "anything");
    expect(status.running).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/session-manager-subagent-guard.test.ts`
Expected: FAIL (functions throw "Session not found" / don't accept 4th param)

- [ ] **Step 3: Implement the guard**

In `packages/coding-agent/src/session-manager.ts`:

```ts
// Add to SessionEntry:
  /** Set for subagent sessions: id of the parent app session that dispatched them. */
  parentSessionId?: string;

// Add module-private helper (near isTerminalAguiEvent):
function assertSessionAccess(entry: SessionEntry, parentSessionId?: string): void {
  if (entry.parentSessionId && entry.parentSessionId !== parentSessionId) {
    throw new Error("Subagent session requires valid parent session id");
  }
}
```

Add `parentSessionId?: string` as the last parameter of `getSessionMessages`, `getSessionSnapshot`, `getSessionStatus`, `connectToSession`; after resolving `entry` (and before reading state), call `assertSessionAccess(entry, parentSessionId)`. In `connectToSession` the call goes right after the `sessions.get(sessionId)` lookup, throwing before any `onComplete`.

In `packages/coding-agent/src/transports/http.ts`, pass `params.parentSessionId` through to the four methods.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/session-manager-subagent-guard.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/src/session-manager.ts packages/coding-agent/src/transports/http.ts packages/chatbot/tests/unit/agent-code/session-manager-subagent-guard.test.ts
git commit --no-verify -m "feat(coding-agent): guard subagent sessions behind parent session id

Co-Authored-By: Kimi (Moonshot AI) <noreply@moonshot.cn>"
```

---

### Task 2: Worker — first-party extension loading + `includeSubagentExtension` flag

**Files:**
- Modify: `packages/coding-agent/src/pi-packages.ts` (`FIRST_PARTY_EXTENSION_PATHS`)
- Modify: `packages/coding-agent/src/session-manager.ts` (`makeCreateRuntime` options)
- Test: `packages/chatbot/tests/unit/agent-code/pi-extension-paths.test.ts`

**Interfaces:**
- Produces:
  - `getFirstPartyExtensionPaths(): string[]` — absolute paths of existing first-party extension dirs (currently one: `<PACKAGE_ROOT>/extensions/subagent`).
  - `getExtensionPaths(options?: { includeSubagentExtension?: boolean }): string[]` — `getPiPackagePaths()` + first-party paths, optionally excluding the subagent extension.
  - `makeCreateRuntime(modelId?: string, options?: { includeSubagentExtension?: boolean })` (default `true`).
- Consumes: `getPiPackagePaths()` (unchanged), `PACKAGE_ROOT` from `./paths`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { getExtensionPaths, getFirstPartyExtensionPaths } = await import(
  "coding-agent/src/pi-packages"
).catch(() => import("../../coding-agent/src/pi-packages" as never));

describe("first-party extension paths", () => {
  it("includes the subagent extension dir by default", () => {
    const paths = getExtensionPaths();
    expect(paths.some((p: string) => p.endsWith("extensions/subagent"))).toBe(true);
  });

  it("excludes the subagent extension when includeSubagentExtension is false", () => {
    const paths = getExtensionPaths({ includeSubagentExtension: false });
    expect(paths.some((p: string) => p.endsWith("extensions/subagent"))).toBe(false);
  });

  it("first-party paths exist on disk", () => {
    for (const p of getFirstPartyExtensionPaths()) {
      expect(p).toMatch(/extensions\/subagent$/);
    }
  });
});
```

> Note for the implementer: use whichever import style the neighboring tests use for `coding-agent` sources; if the package exports map blocks deep imports, add `"./pi-packages": "./src/pi-packages.ts"` to the `exports` of `packages/coding-agent/package.json` (it follows the existing pattern) and import `coding-agent/pi-packages`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/pi-extension-paths.test.ts`
Expected: FAIL (`getExtensionPaths` is not a function)

- [ ] **Step 3: Implement**

In `packages/coding-agent/src/pi-packages.ts`:

```ts
import { readdirSync } from "node:fs";

const FIRST_PARTY_EXTENSIONS_DIR = path.join(PACKAGE_ROOT, "extensions");

/** First-party extension dirs (each with an index.ts), e.g. extensions/subagent. */
export function getFirstPartyExtensionPaths(): string[] {
  if (!existsSync(FIRST_PARTY_EXTENSIONS_DIR)) return [];
  return readdirSync(FIRST_PARTY_EXTENSIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(FIRST_PARTY_EXTENSIONS_DIR, d.name, "index.ts")))
    .map((d) => path.join(FIRST_PARTY_EXTENSIONS_DIR, d.name));
}

/** All extension paths handed to the Pi resource loader. */
export function getExtensionPaths(options?: { includeSubagentExtension?: boolean }): string[] {
  const firstParty = getFirstPartyExtensionPaths().filter(
    (p) => options?.includeSubagentExtension !== false || !p.endsWith(path.join("extensions", "subagent")),
  );
  return [...getPiPackagePaths(), ...firstParty];
}
```

In `makeCreateRuntime` (session-manager.ts), add `options?: { includeSubagentExtension?: boolean }` and replace `additionalExtensionPaths: getPiPackagePaths()` with `additionalExtensionPaths: getExtensionPaths({ includeSubagentExtension: options?.includeSubagentExtension ?? true })`. Update the import.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/pi-extension-paths.test.ts`
Expected: PASS — the third test fails until Task 5 creates `extensions/subagent/index.ts`; if so, create the dir with a placeholder `export default function () {}` now and let Task 5 fill it in.

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/src/pi-packages.ts packages/coding-agent/src/session-manager.ts packages/coding-agent/package.json packages/chatbot/tests/unit/agent-code/pi-extension-paths.test.ts
git commit --no-verify -m "feat(coding-agent): load first-party extensions with opt-out for child sessions

Co-Authored-By: Kimi (Moonshot AI) <noreply@moonshot.cn>"
```

---

### Task 3: Worker — subagent event collector

**Files:**
- Create: `packages/coding-agent/src/subagent-collector.ts`
- Modify: `packages/coding-agent/package.json` (add `"./subagent-collector": "./src/subagent-collector.ts"` to `exports`)
- Test: `packages/chatbot/tests/unit/agent-code/subagent-collector.test.ts`

**Interfaces:**
- Produces: `startSubagentCollector(entry: { sessionId: string; runtime: { session: PiSessionLike } ; eventLog: SessionEventLog; snapshotCursorSeq?: number }, runId: string): () => void` — subscribes to the child Pi session, translates events with a dedicated `PiToAguiTranslator` (`threadId: entry.sessionId`, `runId`), appends to `entry.eventLog`, maintains `entry.snapshotCursorSeq` on `message_end`/`tool_execution_end`, and returns an `unsubscribe`. No files-changed, no MESSAGES_SNAPSHOT (spec §4.3).
- Consumes: `PiToAguiTranslator`, `AguiEventType` from `./pi-to-agui-translator`; `SessionEventLog` from `./event-log`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { startSubagentCollector } = await import("coding-agent/subagent-collector");
const { SessionEventLog } = await import("coding-agent/event-log");

function fakeChildSession() {
  const listeners = new Set<(e: unknown) => void>();
  return {
    isStreaming: true,
    messages: [] as unknown[],
    subscribe(cb: (e: unknown) => void) { listeners.add(cb); return () => listeners.delete(cb); },
    __emit(e: unknown) { for (const l of listeners) l(e); },
  };
}

describe("startSubagentCollector", () => {
  it("appends translated AG-UI events to the child event log", () => {
    const session = fakeChildSession();
    const eventLog = new SessionEventLog();
    const entry = { sessionId: "child-1", runtime: { session }, eventLog, snapshotCursorSeq: 0 };
    const stop = startSubagentCollector(entry as never, "run-1");

    session.__emit({ type: "agent_start" });
    session.__emit({
      type: "message_start",
      message: { role: "assistant", timestamp: 123, content: [] },
    });

    const types = eventLog.readAfter(0).map((l) => l.event.type);
    expect(types).toContain("RUN_STARTED");
    stop();
  });

  it("advances snapshotCursorSeq on message_end", () => {
    const session = fakeChildSession();
    const eventLog = new SessionEventLog();
    const entry = { sessionId: "child-1", runtime: { session }, eventLog, snapshotCursorSeq: 0 };
    const stop = startSubagentCollector(entry as never, "run-1");

    session.__emit({ type: "message_end", message: { role: "assistant", timestamp: 1, content: [] } });
    expect(entry.snapshotCursorSeq).toBe(eventLog.lastSeq);
    stop();
  });

  it("unsubscribe stops the flow", () => {
    const session = fakeChildSession();
    const eventLog = new SessionEventLog();
    const entry = { sessionId: "child-1", runtime: { session }, eventLog, snapshotCursorSeq: 0 };
    const stop = startSubagentCollector(entry as never, "run-1");
    stop();
    const before = eventLog.lastSeq;
    session.__emit({ type: "agent_start" });
    expect(eventLog.lastSeq).toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/subagent-collector.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/subagent-collector.ts`**

```ts
import { getTraceLogger } from "tracing";
import { SessionEventLog } from "./event-log";
import { AguiEventType, PiToAguiTranslator, type BaseEvent } from "./pi-to-agui-translator";

interface SubagentCollectorEntry {
  sessionId: string;
  runtime: { session: { subscribe: (cb: (e: unknown) => void) => () => void } };
  eventLog: SessionEventLog;
  snapshotCursorSeq?: number;
}

/**
 * Slim run collector for subagent sessions: Pi events → AG-UI → the child's
 * own event log. No files-changed diff (the parent turn's diff covers the
 * shared-cwd case; worktree runs are a documented blind spot) and no
 * MESSAGES_SNAPSHOT (the dedicated view always starts from getSessionSnapshot).
 */
export function startSubagentCollector(entry: SubagentCollectorEntry, runId: string): () => void {
  const log = getTraceLogger("worker");
  const translator = new PiToAguiTranslator({ threadId: entry.sessionId, runId });

  const unsubscribe = entry.runtime.session.subscribe((rawEvent) => {
    const event = rawEvent as { type: string };
    for (const aguiEvent of translator.translate(rawEvent as never)) {
      entry.eventLog.append(aguiEvent as BaseEvent);
    }
    if (event.type === "message_end" || event.type === "tool_execution_end") {
      entry.snapshotCursorSeq = entry.eventLog.lastSeq;
    }
  });

  return () => {
    unsubscribe();
    log.info("subagent.collector_stopped", { sessionId: entry.sessionId, runId });
  };
}
```

Check `AguiEventType` is exported from `pi-to-agui-translator.ts` (it is: `AguiEventType as EventType`); re-export or adjust import to match the real export name.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/subagent-collector.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/src/subagent-collector.ts packages/coding-agent/package.json packages/chatbot/tests/unit/agent-code/subagent-collector.test.ts
git commit --no-verify -m "feat(coding-agent): add lightweight event collector for subagent sessions

Co-Authored-By: Kimi (Moonshot AI) <noreply@moonshot.cn>"
```

---

### Task 4: Worker — `runSubagent()` core

**Files:**
- Modify: `packages/coding-agent/src/session-manager.ts`
- Test: `packages/chatbot/tests/unit/agent-code/session-manager-subagent.test.ts`

**Interfaces:**
- Consumes: Task 1 guard fields, Task 2 `makeCreateRuntime(modelId, { includeSubagentExtension })`, Task 3 `startSubagentCollector`.
- Produces (all exported from `coding-agent/session-manager`):

```ts
export interface SubagentRunParams {
  task: string;
  description?: string;
  model?: string;
  cwd?: string;
}

export interface SubagentDetails {
  subSessionId: string;
  subPiSessionId: string;
  parentSessionId: string;
  parentToolCallId: string;
  description?: string;
}

export interface SubagentRunResult {
  content: Array<{ type: "text"; text: string }>;
  details: SubagentDetails;
  isError?: boolean;
}

export function resolveSubagentCwd(projectCwd: string, cwdParam?: string): { ok: true; cwd: string } | { ok: false; error: string };
export function resolveSubagentModelId(parentModel: { provider: string; id: string } | undefined, available: string[], modelParam?: string): { ok: true; modelId?: string } | { ok: false; error: string };
export async function runSubagent(parentPiSessionId: string, toolCallId: string, params: SubagentRunParams, signal?: AbortSignal): Promise<SubagentRunResult>;
```

- [ ] **Step 1: Write the failing tests**

Cover the pure helpers first (they need no Pi session):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { resolveSubagentCwd, resolveSubagentModelId } = await import("coding-agent/session-manager");

describe("resolveSubagentCwd", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-cwd-"));
  it("defaults to the parent cwd", () => {
    expect(resolveSubagentCwd(root)).toEqual({ ok: true, cwd: root });
  });
  it("accepts an existing directory inside the project", () => {
    const wt = path.join(root, ".worktrees", "feat-x");
    fs.mkdirSync(wt, { recursive: true });
    expect(resolveSubagentCwd(root, ".worktrees/feat-x")).toEqual({ ok: true, cwd: wt });
  });
  it("rejects paths outside the project root", () => {
    const r = resolveSubagentCwd(root, "..");
    expect(r.ok).toBe(false);
  });
  it("rejects non-existent directories", () => {
    const r = resolveSubagentCwd(root, "nope");
    expect(r.ok).toBe(false);
  });
});

describe("resolveSubagentModelId", () => {
  const available = ["opencode-go/kimi-k2", "opencode-go/glm-4.6"];
  it("inherits the parent model when no param", () => {
    expect(resolveSubagentModelId({ provider: "p", id: "m" }, available)).toEqual({ ok: true, modelId: "p/m" });
  });
  it("accepts a strict match", () => {
    expect(resolveSubagentModelId(undefined, available, "opencode-go/kimi-k2")).toEqual({ ok: true, modelId: "opencode-go/kimi-k2" });
  });
  it("rejects non-matching values with the full list in the error", () => {
    const r = resolveSubagentModelId(undefined, available, "kimi");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("kimi");
      expect(r.error).toContain("opencode-go/kimi-k2");
      expect(r.error).toContain("opencode-go/glm-4.6");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/session-manager-subagent.test.ts`
Expected: FAIL (exports not found)

- [ ] **Step 3: Implement helpers + `runSubagent`**

In `session-manager.ts`:

```ts
export function resolveSubagentCwd(
  projectCwd: string,
  cwdParam?: string,
): { ok: true; cwd: string } | { ok: false; error: string } {
  if (!cwdParam) return { ok: true, cwd: projectCwd };
  const resolved = path.resolve(projectCwd, cwdParam);
  const rel = path.relative(projectCwd, resolved);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: `cwd must resolve inside the project root: ${cwdParam}` };
  }
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return { ok: false, error: `cwd is not an existing directory: ${cwdParam}` };
  }
  return { ok: true, cwd: resolved };
}

export function resolveSubagentModelId(
  parentModel: { provider: string; id: string } | undefined,
  available: string[],
  modelParam?: string,
): { ok: true; modelId?: string } | { ok: false; error: string } {
  if (!modelParam) {
    return { ok: true, modelId: parentModel ? `${parentModel.provider}/${parentModel.id}` : undefined };
  }
  if (available.includes(modelParam)) return { ok: true, modelId: modelParam };
  return {
    ok: false,
    error: `Unknown model "${modelParam}". Available models: ${available.join(", ")}`,
  };
}
```

`runSubagent` (sketch — follow existing patterns in `getOrCreateSession`/`loadSessionFromDisk`):

```ts
export async function runSubagent(
  parentPiSessionId: string,
  toolCallId: string,
  params: SubagentRunParams,
  signal?: AbortSignal,
): Promise<SubagentRunResult> {
  const parent = [...sessions.values()].find((e) => e.piSessionId === parentPiSessionId);
  if (!parent) throw new Error(`Parent session not found for pi session ${parentPiSessionId}`);

  const projectsRoot = process.env.CODING_AGENT_PROJECTS_ROOT!;
  const parentCwd = resolveProjectPath(projectsRoot, parent.project);

  const cwdResult = resolveSubagentCwd(parentCwd, params.cwd);
  if (!cwdResult.ok) return errorResult(cwdResult.error, parent, toolCallId, params);

  const available = (await getAvailableModels()).map((m) => m.label);
  const modelResult = resolveSubagentModelId(parent.runtime.session.model, available, params.model);
  if (!modelResult.ok) return errorResult(modelResult.error, parent, toolCallId, params);

  const sessionManager = SessionManager.create(
    path.join(process.env.CODING_AGENT_SESSIONS_DIR!, "subagents"),
  );
  const subPiSessionId = sessionManager.getSessionId();
  const subSessionId = crypto.randomUUID();
  const createRuntime = makeCreateRuntime(modelResult.modelId, { includeSubagentExtension: false });
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd: cwdResult.cwd,
    agentDir: getAgentDir(),
    sessionManager,
  });

  const entry: SessionEntry = {
    sessionId: subSessionId,
    piSessionId: subPiSessionId,
    project: parent.project,
    parentSessionId: parent.sessionId,
    parentToolCallId: toolCallId,
    runtime,
    eventLog: new SessionEventLog(),
  };
  sessions.set(subSessionId, entry);

  const runId = crypto.randomUUID();
  const stopCollector = startSubagentCollector(entry, runId);
  const onAbort = () => { void runtime.session.abort(); };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    await runtime.session.prompt(params.task);
    const text = lastAssistantText(runtime.session.messages);
    return {
      content: [{ type: "text", text: signal?.aborted ? `[aborted] ${text}` : text || "(subagent produced no text output)" }],
      details: makeDetails(),
    };
  } catch (err) {
    return { content: [{ type: "text", text: `Subagent failed: ${String(err)}` }], details: makeDetails(), isError: true };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    stopCollector();
  }

  function makeDetails(): SubagentDetails {
    return { subSessionId, subPiSessionId, parentSessionId: parent.sessionId, parentToolCallId: toolCallId, description: params.description };
  }
}
```

Also: add `parentToolCallId?: string` to `SessionEntry`; `lastAssistantText` walks `messages` backwards for `role === "assistant"` and joins text parts; `errorResult` needs placeholder ids for a session that never started — use `{ subSessionId: "", subPiSessionId: "", parentSessionId: parent.sessionId, parentToolCallId: toolCallId, description: params.description }` with `isError: true` (no session is created on validation failure, so no link should resolve — Task 6 returns "not found" for empty ids).

Also extend `disposeSession`: after disposing the parent, iterate `sessions` and dispose entries whose `parentSessionId === sessionId` (spec §4.4).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/session-manager-subagent.test.ts`
Expected: PASS (7 helper tests). `runSubagent` itself is covered by integration in Task 5/6 and manual E2E (it needs a real model); do not unit-test the network path.

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/src/session-manager.ts packages/chatbot/tests/unit/agent-code/session-manager-subagent.test.ts
git commit --no-verify -m "feat(coding-agent): add runSubagent with cwd/model validation and session registration

Co-Authored-By: Kimi (Moonshot AI) <noreply@moonshot.cn>"
```

---

### Task 5: Worker — the `subagent` Pi extension

**Files:**
- Create: `packages/coding-agent/extensions/subagent/index.ts`
- Create: `packages/coding-agent/extensions/subagent/description.ts` (model list builder, importable by tests)
- Test: `packages/chatbot/tests/unit/agent-code/subagent-extension.test.ts`

**Interfaces:**
- Consumes: `runSubagent`, `SubagentRunParams`, `SubagentRunResult` (Task 4) via relative import `../../src/session-manager.js`; `getAvailableModels` for the description list.
- Produces: default export `(pi: ExtensionAPI) => void` registering tool `subagent`; `buildSubagentToolDescription(models: string[]): string`.

Key facts (verified in the SDK): `execute(toolCallId, params, signal, onUpdate, ctx)` receives `ctx.sessionManager` (read-only, exposes the Pi session id — verify the exact getter, `getSessionId()`), `ctx.modelRegistry`, `ctx.cwd`. TypeBox: `import { Type } from "typebox"` (available — `@earendil-works/pi-coding-agent` depends on it; add `"typebox"` to `packages/coding-agent/package.json` deps if the import doesn't resolve).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { buildSubagentToolDescription } = await import(
  "../../coding-agent/extensions/subagent/description"
);
const registerExtension = (await import(
  "../../coding-agent/extensions/subagent/index"
)).default;

describe("subagent extension", () => {
  it("description lists available models and reserved agent param", () => {
    const d = buildSubagentToolDescription(["opencode-go/kimi-k2"]);
    expect(d).toContain("opencode-go/kimi-k2");
    expect(d).toContain("agent");
  });

  it("registers a tool named subagent", async () => {
    const tools: Array<{ name: string }> = [];
    registerExtension({ registerTool: (t: never) => tools.push(t) } as never);
    expect(tools.map((t) => t.name)).toEqual(["subagent"]);
  });

  it("returns an error when the reserved agent param is used", async () => {
    let tool: { execute: Function } | undefined;
    registerExtension({ registerTool: (t: never) => { tool = t; } } as never);
    const result = await tool!.execute(
      "tc-1",
      { task: "do x", agent: "scout" },
      undefined,
      undefined,
      { sessionManager: { getSessionId: () => "pi-parent" } },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("reserved");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/subagent-extension.test.ts`
Expected: FAIL (modules not found)

- [ ] **Step 3: Implement**

`packages/coding-agent/extensions/subagent/description.ts`:

```ts
export function buildSubagentToolDescription(models: string[]): string {
  return [
    "Delegate a self-contained task to a subagent running in an isolated session.",
    "The subagent inherits this session's tools (except subagent itself), skills and working directory.",
    "Use multiple subagent calls in one response to run tasks in parallel.",
    "For parallel implementation work, create one git worktree per subagent inside the project (e.g. .worktrees/<name>) and pass it as cwd.",
    `Available models for the optional model param: ${models.join(", ") || "(unknown)"}.`,
    "The agent param is reserved for a future agent-definition format and must not be used.",
  ].join(" ");
}
```

`packages/coding-agent/extensions/subagent/index.ts`:

```ts
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runSubagent, getAvailableModels } from "../../src/session-manager.js";
import { buildSubagentToolDescription } from "./description.js";

const SubagentParams = Type.Object({
  task: Type.String({ description: "Self-contained task prompt for the subagent" }),
  description: Type.Optional(Type.String({ description: "Short label for UI display" })),
  model: Type.Optional(Type.String({ description: "provider/model-id for the subagent; defaults to this session's model" })),
  cwd: Type.Optional(Type.String({ description: "Working directory for the subagent, inside the project root (e.g. a git worktree). Defaults to this session's cwd" })),
  agent: Type.Optional(Type.String({ description: "RESERVED — do not use" })),
});

export default function registerSubagentExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: buildSubagentToolDescription([]),
    parameters: SubagentParams,
    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      if (params.agent !== undefined) {
        return {
          content: [{ type: "text" as const, text: "The 'agent' param is reserved for a future agent-definition format and is not supported." }],
          details: { reserved: true },
          isError: true,
        };
      }
      const parentPiSessionId = ctx.sessionManager.getSessionId();
      return runSubagent(parentPiSessionId, toolCallId, params, signal);
    },
  });
}
```

The model list in the static description is built at load time; call `getAvailableModels()` lazily is not possible at registration, so keep the description generic and make the **error message carry the full list** (Task 4) — adjust `buildSubagentToolDescription` usage accordingly: the description says the list is returned on invalid input. Update the first test to match this wording.

Verify at implementation time: `ctx.sessionManager.getSessionId()` is the real getter on `ReadonlySessionManager` (check `dist/core/extensions/types.d.ts`); if it differs, adapt.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/subagent-extension.test.ts tests/unit/agent-code/pi-extension-paths.test.ts`
Expected: PASS both files

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/extensions packages/coding-agent/package.json packages/chatbot/tests/unit/agent-code/subagent-extension.test.ts
git commit --no-verify -m "feat(coding-agent): register subagent tool as a first-party Pi extension

Co-Authored-By: Kimi (Moonshot AI) <noreply@moonshot.cn>"
```

---

### Task 6: Worker — `getSubagentSession` RPC (memory + cold path)

**Files:**
- Modify: `packages/coding-agent/src/session-manager.ts` (`getSubagentSessionForToolCall`, subagent-aware disk reload in `loadSessionFromDisk`)
- Modify: `packages/coding-agent/src/transports/http.ts` (new RPC method)
- Test: `packages/chatbot/tests/unit/agent-code/session-manager-subagent-lookup.test.ts`

**Interfaces:**
- Consumes: `SessionEntry.parentToolCallId` (Task 4), guard (Task 1).
- Produces:

```ts
export async function getSubagentSessionForToolCall(
  parentSessionId: string,
  toolCallId: string,
): Promise<{ subSessionId: string; subPiSessionId: string }>
```

Behavior (spec §4.5): (1) memory: find entry with `parentSessionId === parentSessionId && parentToolCallId === toolCallId`; (2) cold: ensure parent is loaded, scan `parent.runtime.session.messages` for `role === "toolResult" && msg.toolCallId === toolCallId`, read `msg.details.subSessionId/subPiSessionId`, reload the child from `<SESSIONS_DIR>/subagents/` (extend `loadSessionFromDisk` with an options param `{ sessionsSubdir?: string; parentSessionId?: string }` applied to `SessionManager.list(path.join(sessionsDir, sessionsSubdir ?? ""))` and the created entry), register it, return ids; (3) throws `Error("Subagent session not found for tool call")` otherwise.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const {
  getSubagentSessionForToolCall,
  __resetSessionsForTests,
  __seedSessionForTests,
} = await import("coding-agent/session-manager");
const { SessionEventLog } = await import("coding-agent/event-log");

beforeEach(() => __resetSessionsForTests());

function seedParentWithToolResult() {
  __seedSessionForTests("parent-1", {
    sessionId: "parent-1", piSessionId: "pi-parent-1", project: "proj",
    runtime: {
      session: {
        isStreaming: false,
        messages: [
          { role: "toolResult", toolCallId: "tc-9", content: "done",
            details: { subSessionId: "child-9", subPiSessionId: "pi-child-9" } },
        ],
      },
    },
    eventLog: new SessionEventLog(),
  } as never);
}

describe("getSubagentSessionForToolCall", () => {
  it("resolves from the in-memory map when registered", async () => {
    seedParentWithToolResult();
    __seedSessionForTests("child-9", {
      sessionId: "child-9", piSessionId: "pi-child-9", project: "proj",
      parentSessionId: "parent-1", parentToolCallId: "tc-9",
      runtime: { session: { messages: [], isStreaming: false } },
      eventLog: new SessionEventLog(),
    } as never);
    const r = await getSubagentSessionForToolCall("parent-1", "tc-9");
    expect(r).toEqual({ subSessionId: "child-9", subPiSessionId: "pi-child-9" });
  });

  it("throws for an unknown toolCallId", async () => {
    seedParentWithToolResult();
    await expect(getSubagentSessionForToolCall("parent-1", "tc-nope")).rejects.toThrow(
      "Subagent session not found for tool call",
    );
  });

  it("throws when the parent session does not exist", async () => {
    await expect(getSubagentSessionForToolCall("nope", "tc-9")).rejects.toThrow();
  });
});
```

> The cold disk-reload branch needs a real session file; cover it with a focused test that writes a minimal Pi session file under a temp `CODING_AGENT_SESSIONS_DIR/subagents` (follow the session file format already exercised in `session-manager-reconnect.test.ts`) or, if the existing reconnect tests show that's heavy, cover the cold branch via manual E2E and keep unit coverage to the memory path + error paths. Decide by following the existing test file's precedent.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/session-manager-subagent-lookup.test.ts`
Expected: FAIL (export not found)

- [ ] **Step 3: Implement + wire the RPC**

In `transports/http.ts` add:

```ts
      case "getSubagentSession": {
        const { parentSessionId, toolCallId } = params as { parentSessionId: string; toolCallId: string };
        result = await getSubagentSessionForToolCall(parentSessionId, toolCallId);
        break;
      }
```

Import it from `../session-manager`. Add the method name to `summarizeRpcParams` allowlist if one exists there.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/session-manager-subagent-lookup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/src/session-manager.ts packages/coding-agent/src/transports/http.ts packages/chatbot/tests/unit/agent-code/session-manager-subagent-lookup.test.ts
git commit --no-verify -m "feat(coding-agent): add getSubagentSession RPC with cold-path rehydration

Co-Authored-By: Kimi (Moonshot AI) <noreply@moonshot.cn>"
```

---

### Task 7: Chatbot — worker-client + `parentSessionId` threading

**Files:**
- Modify: `packages/chatbot/lib/features/code/worker-client.ts` (`getSubagentSession` method; `parentSessionId?` on `getSessionSnapshot`/`connectToSession` params)
- Modify: `packages/chatbot/lib/features/code/actions.ts` (server action wrapper, following `getCodingAgentModels` pattern)
- Modify: `packages/chatbot/lib/features/code/hooks/use-coding-agent.ts` (optional `parentSessionId` option forwarded to snapshot/connect calls)
- Test: `packages/chatbot/tests/unit/agent-code/worker-client-subagent.test.ts`

**Interfaces:**
- Produces:
  - `WorkerClient.getSubagentSession(params: { parentSessionId: string; toolCallId: string }): Promise<{ subSessionId: string; subPiSessionId: string }>`
  - `getSubagentSessionAction(input: { parentSessionId: string; toolCallId: string }): Promise<{ subSessionId: string; subPiSessionId: string } | { error: string }>` in `actions.ts`
  - `useCodingAgent({ project, sessionId, parentSessionId?, piSessionId? })` — `parentSessionId` and `piSessionId` forwarded to `getSessionSnapshot`/`connectToSession` RPC params.
- Consumes: existing `WorkerClient.call`, `useCodingAgent` options `{ project, sessionId }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { WorkerClient } = await import("@/lib/features/code/worker-client");

describe("WorkerClient.getSubagentSession", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls the getSubagentSession RPC method", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        jsonrpc: "2.0", id: 1,
        result: { subSessionId: "child-1", subPiSessionId: "pi-child-1" },
      })),
    );
    const client = new WorkerClient("http://worker.test");
    const r = await client.getSubagentSession({ parentSessionId: "p", toolCallId: "tc-1" });
    expect(r).toEqual({ subSessionId: "child-1", subPiSessionId: "pi-child-1" });
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.method).toBe("getSubagentSession");
    expect(body.params).toEqual({ parentSessionId: "p", toolCallId: "tc-1" });
  });

  it("forwards parentSessionId on getSessionSnapshot", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        jsonrpc: "2.0", id: 1,
        result: { messages: [], cursor: null, running: false },
      })),
    );
    const client = new WorkerClient("http://worker.test");
    await client.getSessionSnapshot({ sessionId: "child-1", parentSessionId: "p" });
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.params).toMatchObject({ sessionId: "child-1", parentSessionId: "p" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/worker-client-subagent.test.ts`
Expected: FAIL (`getSubagentSession` is not a function; `parentSessionId` not forwarded)

- [ ] **Step 3: Implement**

- `worker-client.ts`: add `getSubagentSession` calling `this.call("getSubagentSession", params)`; add `parentSessionId?: string` to the param types of `getSessionSnapshot` and `connectToSession` and include it in the JSON-RPC params objects.
- `actions.ts`: add `"use server"` action `getSubagentSessionAction` that builds a `WorkerClient` and wraps the call in try/catch returning `{ error }` on failure (mirror `getCodingAgentModels`).
- `use-coding-agent.ts`: extend the options object with `parentSessionId?: string; piSessionId?: string` and add them to the `getSessionSnapshot` and `connectToSession` param objects at the existing call sites.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/worker-client-subagent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/lib/features/code/worker-client.ts packages/chatbot/lib/features/code/actions.ts packages/chatbot/lib/features/code/hooks/use-coding-agent.ts packages/chatbot/tests/unit/agent-code/worker-client-subagent.test.ts
git commit --no-verify -m "feat(chatbot): add getSubagentSession RPC client and parent session threading

Co-Authored-By: Kimi (Moonshot AI) <noreply@moonshot.cn>"
```

---

### Task 8: Chatbot — subagent link in `ToolCallGroup`

**Files:**
- Create: `packages/chatbot/components/code/subagent-tool-link.tsx`
- Modify: `packages/chatbot/components/code/tool-call-group.tsx` (render the link for `group.name === "subagent"`)
- Modify: the render chain passing `project`/`sessionId` down to `ToolCallGroup` (`agent-response.tsx` / `agent-message.tsx` / `agent-conversation.tsx` / `agent-code-chat.tsx` — inspect and thread an optional `codeContext={{ project, sessionId }}` prop, or a small React context; choose whichever matches the existing prop-drilling depth)
- Test: `packages/chatbot/tests/unit/agent-code/subagent-tool-link.test.tsx`

**Interfaces:**
- Consumes: `getSubagentSessionAction` (Task 7), `ToolCallGroup` type (fields: `id`, `name`, `args`, `argsParsed?`, `result?`, `status`).
- Produces: `SubagentToolLink({ project, parentSessionId, toolCallId }: { project: string; parentSessionId: string; toolCallId: string }): JSX.Element | null` — resolves the lookup on mount, renders a `next/link` to `/agent/code/${project}/${parentSessionId}/subagent/${subSessionId}?pi=${subPiSessionId}` labeled "Ver sesión del subagente"; renders nothing while loading or on error.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/features/code/actions", () => ({
  getSubagentSessionAction: vi.fn(),
}));

const { getSubagentSessionAction } = await import("@/lib/features/code/actions");
const { SubagentToolLink } = await import("@/components/code/subagent-tool-link");

describe("SubagentToolLink", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the link to the dedicated subagent route", async () => {
    vi.mocked(getSubagentSessionAction).mockResolvedValue({
      subSessionId: "child-1", subPiSessionId: "pi-child-1",
    });
    render(<SubagentToolLink project="proj" parentSessionId="p" toolCallId="tc-1" />);
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /sesión del subagente/i });
      expect(link).toHaveAttribute(
        "href",
        "/agent/code/proj/p/subagent/child-1?pi=pi-child-1",
      );
    });
  });

  it("renders nothing when the lookup fails", async () => {
    vi.mocked(getSubagentSessionAction).mockResolvedValue({ error: "not found" });
    const { container } = render(
      <SubagentToolLink project="proj" parentSessionId="p" toolCallId="tc-1" />,
    );
    await waitFor(() => expect(getSubagentSessionAction).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
```

> If the known `React.act` environment issue blocks `@testing-library/react` render tests in your environment, verify it hits the *existing* render tests equally (`tool-call-group.test.tsx`) and keep this test consistent with them — do not work around it differently.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/subagent-tool-link.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

`subagent-tool-link.tsx` (client component): `useEffect` calls `getSubagentSessionAction({ parentSessionId, toolCallId })`; local state `ids | null | "error"`; renders `Link` with the href above and `Bot`/`ArrowRight` icon from lucide, styled like the existing file-reference links (check `turn-files-changed.tsx` for link styling conventions).

In `tool-call-group.tsx`: when `group.name === "subagent"`, render `<SubagentToolLink project={...} parentSessionId={...} toolCallId={group.id} />` under the args. Thread `project`/`parentSessionId` via the chosen prop/context from `AgentCodeChat` (which has both).

Also: for `subagent` groups, show `argsParsed.description ?? first line of argsParsed.task` as the summary line instead of raw JSON (check how `summary` is computed in `lib/features/code/tool-summary.ts` and add a `subagent` case there with its own unit test in the existing tool-summary test file if one exists).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/subagent-tool-link.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/components/code/subagent-tool-link.tsx packages/chatbot/components/code/tool-call-group.tsx packages/chatbot/lib/features/code/tool-summary.ts packages/chatbot/tests/unit/agent-code/subagent-tool-link.test.tsx
git commit --no-verify -m "feat(chatbot): link subagent tool calls to their dedicated session view

Co-Authored-By: Kimi (Moonshot AI) <noreply@moonshot.cn>"
```

---

### Task 9: Chatbot — dedicated sub-session route

**Files:**
- Create: `packages/chatbot/app/(chat)/agent/code/[project]/[sessionId]/subagent/[subSessionId]/page.tsx`
- Create: `packages/chatbot/components/code/subagent-session-view.tsx` (client: Header + conversation composition)
- Test: `packages/chatbot/tests/unit/agent-code/subagent-session-view.test.tsx`

**Interfaces:**
- Consumes: `useCodingAgent({ project, sessionId: subSessionId, parentSessionId, piSessionId })` (Task 7), `AgentConversation` (existing), `Header`/`Logo`/`ThemeToggle` (existing), `withAuth`, `Sidebar`, `ClientErrorWrapper` (existing patterns from the parent route).
- Produces: route `/agent/code/[project]/[sessionId]/subagent/[subSessionId]?pi=<subPiSessionId>`.

Composition (spec §5.2): `Sidebar` + `Header.Container` (`Header.Left`: `Logo` + back link "Volver a la sesión principal" → `/agent/code/${project}/${sessionId}`; `Header.Right`: `ThemeToggle`) + `Main` with `AgentConversation` fed by the hook. **No** `AgentCodeChatLayout`, no composer, no model picker, no new-session button. If `AgentConversation` needs `FileBrowserProvider` context for file links, wrap with `{ project, sessionId: subSessionId }` (verify at implementation by reading `agent-conversation.tsx`'s context consumption). `CODING_AGENT_ENABLED !== "true"` → `notFound()`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/features/code/hooks/use-coding-agent", () => ({
  useCodingAgent: vi.fn(() => ({ items: [], status: "idle", error: null })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { SubagentSessionView } = await import("@/components/code/subagent-session-view");
const { useCodingAgent } = await import("@/lib/features/code/hooks/use-coding-agent");

describe("SubagentSessionView", () => {
  it("feeds the hook with sub session and parent ids", () => {
    render(
      <SubagentSessionView project="proj" parentSessionId="p" subSessionId="c" subPiSessionId="pi-c" />,
    );
    expect(useCodingAgent).toHaveBeenCalledWith(
      expect.objectContaining({ project: "proj", sessionId: "c", parentSessionId: "p", piSessionId: "pi-c" }),
    );
  });

  it("renders a back link to the parent session and no composer", () => {
    render(
      <SubagentSessionView project="proj" parentSessionId="p" subSessionId="c" subPiSessionId="pi-c" />,
    );
    expect(screen.getByRole("link", { name: /sesión principal/i })).toHaveAttribute(
      "href", "/agent/code/proj/p",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/subagent-session-view.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement page + view**

`page.tsx` (server component, mirrors the parent route's auth + feature-flag shape):

```tsx
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ClientErrorWrapper } from "@/components/code/client-error-wrapper";
import { SubagentSessionView } from "@/components/code/subagent-session-view";
import { withAuth, type Authenticated } from "@/lib/features/auth/with-auth/hoc";

async function SubagentSessionPage({
  params, searchParams, user,
}: {
  params: Promise<{ project: string; sessionId: string; subSessionId: string }>;
  searchParams: Promise<{ pi?: string }>;
} & Authenticated) {
  if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
  const { project, sessionId, subSessionId } = await params;
  const { pi } = await searchParams;
  return (
    <>
      <Sidebar user={user} />
      <ClientErrorWrapper sessionId={subSessionId}>
        <SubagentSessionView
          project={project}
          parentSessionId={sessionId}
          subSessionId={subSessionId}
          subPiSessionId={pi}
        />
      </ClientErrorWrapper>
    </>
  );
}

export default withAuth(SubagentSessionPage);
```

Verify against the real `ClientErrorWrapper` props and the actual hook return shape used by `AgentConversation` (`items`, scroll state, etc.) and wire exactly those.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter chatbot exec vitest run tests/unit/agent-code/subagent-session-view.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "packages/chatbot/app/(chat)/agent/code/[project]/[sessionId]/subagent" packages/chatbot/components/code/subagent-session-view.tsx packages/chatbot/tests/unit/agent-code/subagent-session-view.test.tsx
git commit --no-verify -m "feat(chatbot): add dedicated read-only subagent session route

Co-Authored-By: Kimi (Moonshot AI) <noreply@moonshot.cn>"
```

---

### Task 10: Docs + manual E2E

**Files:**
- Modify: `packages/coding-agent/AGENTS.md` (Key Files table + a short "Subagent extension" section: how it loads, `SESSIONS_DIR/subagents/`, guard, lookup RPC)
- Modify: `docs/superpowers/specs/2026-08-02-subagent-extension-design.md` (status: Propuesta → Implementada, if all E2E passes)

- [ ] **Step 1: Update `packages/coding-agent/AGENTS.md`**

Add to Key Files: `extensions/subagent/` — first-party subagent tool (thin shell over `runSubagent`), `src/subagent-collector.ts` — child event collector. Add a short section describing: loading via `getExtensionPaths`, anti-recursion flag, sub-sessions under `<CODING_AGENT_SESSIONS_DIR>/subagents/`, `parentSessionId` guard, `getSubagentSession` RPC.

- [ ] **Step 2: Type-check the worker**

Run: `pnpm build:worker`
Expected: clean (`tsc --noEmit`)

- [ ] **Step 3: Manual E2E (spec §8 checklist)**

1. `pnpm dev`; open a coding-agent chat; ask it to use the subagent tool (or the `dispatching-parallel-agents` skill) → tool call appears.
2. Click "Ver sesión del subagente" **while it runs** → live streaming in the dedicated route.
3. Reload both views; restart the worker; reopen via the link (cold path).
4. Parallel dispatch: 2–3 subagents, each with its own `.worktrees/<name>` cwd → independent links, edits land in the right worktrees.
5. Cancel the parent run → child aborted, partial result with `[aborted]` prefix.

- [ ] **Step 4: Flip spec status + commit**

```bash
git add packages/coding-agent/AGENTS.md docs/superpowers/specs/2026-08-02-subagent-extension-design.md
git commit --no-verify -m "docs: mark subagent extension spec as implemented and document the feature

Co-Authored-By: Kimi (Moonshot AI) <noreply@moonshot.cn>"
```

---

## Self-Review Notes (completed)

- **Spec coverage:** §4.1 extensión → T5; §4.2 runSubagent/cwd/model → T4; §4.3 colector → T3; §4.4 guard+dispose → T1/T4; §4.5 lookup RPC → T6; §4.6 sin cambios → verificado (no task toca translator); §5.1 link → T8; §5.2 ruta → T9; D7 cwd → T4/T5; tests → cada task + T10 E2E; §6 errores → T4 (cwd/model), T5 (agent), T1 (guard), T6 (not found).
- **Placeholders:** ninguno intencional; los puntos marcados "verify at implementation" son APIs del SDK cuya superficie exacta (`ReadonlySessionManager.getSessionId`, props de `ClientErrorWrapper`) debe confirmarse contra el código, no decisiones pendientes.
- **Type consistency:** `SubagentRunParams`/`SubagentDetails`/`SubagentRunResult` idénticos en T4/T5/T6; `parentSessionId`/`parentToolCallId` coherentes entre T1/T4/T6/T7/T8/T9; href con `?pi=` coherente entre T8 (emisor) y T9 (consumidor).
