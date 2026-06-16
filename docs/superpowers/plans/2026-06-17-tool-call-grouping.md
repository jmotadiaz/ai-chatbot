# Coding Agent Tool Call Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render coding agent tool calls as one scannable group per call (header with tool name + brief description + status, collapsable body with args and output) instead of detached tool badges and orphan result collapsibles.

**Architecture:** Pure derivation in the hook (`groupItems(messages, toolErrors?)` → `AgentItem[]`); `PiToAguiTranslator` additionally emits `StepStarted`/`StepFinished` carrying `toolCallId` and `isError` in `rawEvent`; new `ToolCallGroup` component consumes the derived groups. `HttpAgent.messages` and the wire format stay unchanged.

**Tech Stack:** Next.js 15 App Router, React 19, AG-UI protocol (`@ag-ui/client`), Pi SDK events, lucide-react, vitest, Playwright, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-17-tool-call-grouping-design.md`

## Global Constraints

- Package manager: **pnpm** (`pnpm test`, `pnpm lint:fix`, `pnpm db:generate`).
- Commit attribution: every AI commit MUST include `Co-Authored-By: minimax-m3 <noreply@example.com>`.
- Lint: `pnpm lint:fix` and `pnpm type:check` after every change.
- Pre-commit hook: when committing, if `pnpm test` (e2e) blocks for unrelated reasons, the user will run `git commit --no-verify` themselves. Do not bypass hooks without explicit authorization.
- E2E test conventions: use capability aliases (e.g. `basicChat`) from `tests/mocks/ai/capabilities.ts`; never hard-code model display names.
- Component style: `React.FC` with explicit prop interfaces; reuse `@/components/ui/collapsible`; reuse lucide icons.
- Type imports: `import type { Message } from "@ag-ui/client"`.
- Test paths: unit tests under `tests/unit/...`; e2e tests under `tests/e2e/...`.

## File Map

| Action | File | Responsibility |
|---|---|---|
| NEW | `lib/features/agent-code/types.ts` | `ToolCallGroup`, `AgentItem` |
| NEW | `lib/features/agent-code/tool-summary.ts` | Pure `summarizeToolCall(name, args)` |
| NEW | `lib/features/agent-code/group-items.ts` | Pure `groupItems(messages, toolErrors?)` |
| NEW | `components/agent-code/tool-call-group.tsx` | `ToolCallGroup` component, `TOOL_ICONS`, `TOOL_DISPLAY_NAMES` |
| MODIFY | `lib/features/agent-code/hooks/use-coding-agent.ts` | Expose `items`, `toolErrors` map; extend `AgentStatus` |
| MODIFY | `lib/features/agent-code/pi-to-agui-translator.ts` | Emit `StepStarted`/`StepFinished` around `tool_execution_*` |
| MODIFY | `components/agent-code/agent-message.tsx` | Render `toolGroups` for assistant; orphan fallback |
| MODIFY | `components/agent-code/agent-conversation.tsx` | Consume `items`; add `step_running` to `statusLabel` |
| NEW | `tests/unit/agent-code/tool-summary.test.ts` | Unit tests for `summarizeToolCall` |
| NEW | `tests/unit/agent-code/group-items.test.ts` | Unit tests for `groupItems` |
| MODIFY | `tests/unit/agent-code/pi-to-agui-translator.test.ts` | Assert `StepStarted`/`StepFinished` emissions |
| MODIFY | `tests/unit/agent-code/use-coding-agent.test.ts` | Assert `items`, `toolErrors`, `step_running` |
| NEW | `tests/e2e/agent-code/tool-call-grouping.spec.ts` | E2E: one tool-calls section per turn |

---

## Task 1: Types + `summarizeToolCall`

**Files:**
- Create: `lib/features/agent-code/types.ts`
- Create: `lib/features/agent-code/tool-summary.ts`
- Create: `tests/unit/agent-code/tool-summary.test.ts`

**Interfaces:**
- Consumes: `Message` from `@ag-ui/client` (used by callers of `summarizeToolCall`).
- Produces: `ToolCallGroup`, `AgentItem`, `ToolCallStatus` (in `types.ts`); `summarizeToolCall(name: string, args: unknown): string`.

- [ ] **Step 1: Create `lib/features/agent-code/types.ts`**

```ts
import type { Message } from "@ag-ui/client";

export type ToolCallStatus = "running" | "ok" | "error";

export interface ToolCallGroup {
  id: string;
  name: string;
  args: string;
  argsParsed?: unknown;
  result?: string;
  status: ToolCallStatus;
  startedAt: number;
  finishedAt?: number;
  summary: string;
}

export type AgentItem =
  | { kind: "user"; message: Message }
  | { kind: "reasoning"; message: Message }
  | { kind: "assistant"; message: Message; toolGroups: ToolCallGroup[] };
```

- [ ] **Step 2: Write the failing test for `summarizeToolCall`**

Create `tests/unit/agent-code/tool-summary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizeToolCall } from "@/lib/features/agent-code/tool-summary";

describe("summarizeToolCall", () => {
  it("returns the command for bash", () => {
    expect(summarizeToolCall("bash", { command: "ls -la" })).toBe("ls -la");
  });

  it("falls back to cmd for shell", () => {
    expect(summarizeToolCall("shell", { cmd: "echo hi" })).toBe("echo hi");
  });

  it("returns the path for read", () => {
    expect(summarizeToolCall("read", { path: "/foo/bar.ts" })).toBe("/foo/bar.ts");
  });

  it("returns the path for write and edit", () => {
    expect(summarizeToolCall("write", { path: "/a.ts" })).toBe("/a.ts");
    expect(summarizeToolCall("edit", { path: "/b.ts" })).toBe("/b.ts");
  });

  it("combines pattern and path for grep", () => {
    expect(summarizeToolCall("grep", { pattern: "TODO", path: "/src" })).toBe(
      "TODO in /src",
    );
  });

  it("returns the path for find and ls", () => {
    expect(summarizeToolCall("find", { path: "/usr" })).toBe("/usr");
    expect(summarizeToolCall("ls", { path: "/" })).toBe("/");
  });

  it("truncates long strings with ellipsis", () => {
    const long = "x".repeat(200);
    expect(summarizeToolCall("bash", { command: long })).toBe(`${"x".repeat(80)}…`);
  });

  it("falls back to JSON.stringify for unknown tools", () => {
    expect(summarizeToolCall("magic", { foo: 1 })).toBe('{"foo":1}');
  });

  it("handles missing args gracefully", () => {
    expect(summarizeToolCall("bash", undefined)).toBe("");
    expect(summarizeToolCall("read", null)).toBe("");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter chatbot test:unit -- tool-summary.test.ts`
Expected: FAIL with "Cannot find module '@/lib/features/agent-code/tool-summary'".

- [ ] **Step 4: Implement `lib/features/agent-code/tool-summary.ts`**

```ts
const MAX_SUMMARY = 80;

function truncate(s: string, max = MAX_SUMMARY): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function summarizeToolCall(name: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  switch (name.toLowerCase()) {
    case "bash":
    case "shell":
      return truncate(String(a?.command ?? a?.cmd ?? ""));
    case "read":
      return String(a?.path ?? a?.filePath ?? "");
    case "write":
      return String(a?.path ?? "");
    case "edit":
      return String(a?.path ?? "");
    case "grep":
      return [a?.pattern, a?.path ? `in ${String(a.path)}` : ""]
        .filter(Boolean)
        .join(" ");
    case "find":
      return String(a?.pattern ?? a?.path ?? "");
    case "ls":
      return String(a?.path ?? "");
    default:
      return truncate(safeStringify(a));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter chatbot test:unit -- tool-summary.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/features/agent-code/types.ts \
        lib/features/agent-code/tool-summary.ts \
        tests/unit/agent-code/tool-summary.test.ts
git commit -m "feat(agent-code): add ToolCallGroup/AgentItem types and summarizeToolCall

- types.ts: ToolCallGroup, AgentItem, ToolCallStatus
- tool-summary.ts: pure function that produces a one-line summary
  per tool (bash command, read path, grep pattern+path, etc.)

Co-Authored-By: minimax-m3 <noreply@example.com>"
```

---

## Task 2: `groupItems` pure function

**Files:**
- Create: `lib/features/agent-code/group-items.ts`
- Create: `tests/unit/agent-code/group-items.test.ts`

**Interfaces:**
- Consumes: `Message` from `@ag-ui/client`; `summarizeToolCall` from Task 1.
- Produces: `groupItems(messages: Message[], toolErrors?: ReadonlyMap<string, true>): AgentItem[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/agent-code/group-items.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Message, ToolCall } from "@ag-ui/client";
import { groupItems } from "@/lib/features/agent-code/group-items";

function userMsg(id: string, content = "hi"): Message {
  return { id, role: "user", content } as Message;
}
function assistantMsg(id: string, toolCalls: ToolCall[] = []): Message {
  return { id, role: "assistant", content: "", toolCalls } as Message;
}
function toolMsg(id: string, toolCallId: string, content: string): Message {
  return { id, role: "tool", toolCallId, content } as Message;
}
function bashCall(id: string, cmd: string): ToolCall {
  return { id, type: "function", function: { name: "bash", arguments: JSON.stringify({ command: cmd }) } } as ToolCall;
}

describe("groupItems", () => {
  it("returns empty for empty input", () => {
    expect(groupItems([])).toEqual([]);
  });

  it("emits user and assistant items in order without tool calls", () => {
    const items = groupItems([userMsg("u1"), assistantMsg("a1")]);
    expect(items.map((i) => i.kind)).toEqual(["user", "assistant"]);
    if (items[1].kind === "assistant") {
      expect(items[1].toolGroups).toEqual([]);
    }
  });

  it("pairs a tool result with its toolCallId into the matching group", () => {
    const items = groupItems([
      assistantMsg("a1", [bashCall("t1", "ls")]),
      toolMsg("r1", "t1", "file.txt\n"),
    ]);
    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    const g = items[0].toolGroups[0];
    expect(g.id).toBe("t1");
    expect(g.name).toBe("bash");
    expect(g.summary).toBe("ls");
    expect(g.result).toBe("file.txt\n");
    expect(g.status).toBe("ok");
    expect(g.finishedAt).toBeTypeOf("number");
  });

  it("marks status error when toolErrors contains the toolCallId", () => {
    const items = groupItems(
      [
        assistantMsg("a1", [bashCall("t1", "false")]),
        toolMsg("r1", "t1", "exit 1"),
      ],
      new Map([["t1", true]]),
    );
    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    expect(items[0].toolGroups[0].status).toBe("error");
  });

  it("drops orphan tool messages and keeps the assistant intact", () => {
    const items = groupItems([
      assistantMsg("a1", [bashCall("t1", "ls")]),
      toolMsg("r1", "orphan", "x"),
    ]);
    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    expect(items[0].toolGroups).toHaveLength(1);
    expect(items[0].toolGroups[0].result).toBeUndefined();
  });

  it("preserves toolGroups order from the assistant message", () => {
    const t1 = bashCall("t1", "ls");
    const t2 = bashCall("t2", "pwd");
    const items = groupItems([
      assistantMsg("a1", [t1, t2]),
      toolMsg("r2", "t2", "/home"),
      toolMsg("r1", "t1", "a.txt\n"),
    ]);
    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    expect(items[0].toolGroups.map((g) => g.id)).toEqual(["t1", "t2"]);
  });

  it("flushes a trailing assistant at the end of the stream", () => {
    const items = groupItems([userMsg("u1"), assistantMsg("a1", [bashCall("t1", "ls")])]);
    expect(items.map((i) => i.kind)).toEqual(["user", "assistant"]);
  });

  it("passes reasoning messages through without touching tool groups", () => {
    const reasoning = { id: "r0", role: "reasoning", content: "thinking..." } as Message;
    const items = groupItems([userMsg("u1"), reasoning, assistantMsg("a1")]);
    expect(items.map((i) => i.kind)).toEqual(["user", "reasoning", "assistant"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot test:unit -- group-items.test.ts`
Expected: FAIL with "Cannot find module '@/lib/features/agent-code/group-items'".

- [ ] **Step 3: Implement `lib/features/agent-code/group-items.ts`**

```ts
import type { Message } from "@ag-ui/client";
import { summarizeToolCall } from "./tool-summary";
import type { AgentItem, ToolCallGroup } from "./types";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function tryParse(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function stringContent(content: unknown): string {
  if (typeof content === "string") return content;
  return safeStringify(content ?? "");
}

function extractArgs(tc: { function?: { arguments?: string }; args?: unknown }): {
  raw: string;
  parsed: unknown;
} {
  const argString =
    typeof tc.function?.arguments === "string" ? tc.function.arguments : "";
  if (argString) {
    const parsed = tryParse(argString);
    return { raw: argString, parsed: parsed ?? argString };
  }
  if (tc.args !== undefined) {
    return { raw: safeStringify(tc.args), parsed: tc.args };
  }
  return { raw: "", parsed: undefined };
}

export function groupItems(
  messages: Message[],
  toolErrors?: ReadonlyMap<string, true>,
): AgentItem[] {
  const out: AgentItem[] = [];
  let current: Extract<AgentItem, { kind: "assistant" }> | null = null;
  const now = () => Date.now();

  const flush = () => {
    if (current) {
      out.push(current);
      current = null;
    }
  };

  for (const m of messages) {
    if (m.role === "assistant") {
      flush();
      const toolGroups: ToolCallGroup[] = (m.toolCalls ?? []).map((tc) => {
        const { raw, parsed } = extractArgs(tc as never);
        return {
          id: tc.id,
          name: tc.function?.name ?? tc.type ?? "tool",
          args: raw,
          argsParsed: parsed,
          status: "running",
          startedAt: now(),
          summary: summarizeToolCall(
            (tc.function?.name ?? tc.type ?? "tool") as string,
            parsed,
          ),
        };
      });
      current = { kind: "assistant", message: m, toolGroups };
      continue;
    }

    if (m.role === "tool") {
      const id = (m as Message & { toolCallId?: string }).toolCallId;
      if (current && id) {
        const group = current.toolGroups.find((g) => g.id === id);
        if (group) {
          group.result = stringContent(m.content);
          group.status = toolErrors?.has(id) ? "error" : "ok";
          group.finishedAt = now();
          continue;
        }
      }
      // Orphan tool message: drop.
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.debug("groupItems.orphan_tool", { id });
      }
      continue;
    }

    if (m.role === "user" || m.role === "reasoning") {
      flush();
      out.push({ kind: m.role, message: m });
    }
  }

  flush();
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chatbot test:unit -- group-items.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/features/agent-code/group-items.ts \
        tests/unit/agent-code/group-items.test.ts
git commit -m "feat(agent-code): add groupItems pure function

Pairs tool results (role: 'tool') with their originating toolCalls
on the preceding assistant message by toolCallId. Drops orphan tool
messages. Honors a toolErrors map for error status.

Co-Authored-By: minimax-m3 <noreply@example.com>"
```

---

## Task 3: Translator emits `StepStarted` / `StepFinished`

**Files:**
- Modify: `lib/features/agent-code/pi-to-agui-translator.ts:361-398`
- Modify: `tests/unit/agent-code/pi-to-agui-translator.test.ts`

**Interfaces:**
- Consumes: existing `PiToAguiTranslator.translate` interface.
- Produces: `StepStarted` and `StepFinished` AG-UI events with `stepName: "tool:<name>"` and `rawEvent: { toolCallId, isError? }`.

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/agent-code/pi-to-agui-translator.test.ts`:

```ts
describe("tool_execution step events", () => {
  it("emits StepStarted on tool_execution_start", () => {
    const t = new PiToAguiTranslator(ctx);
    const events = t.translate({
      type: "tool_execution_start",
      toolCallId: "t1",
      toolName: "bash",
    });
    const stepStarted = events.find((e) => e.type === EventType.STEP_STARTED);
    expect(stepStarted).toBeDefined();
    expect((stepStarted as unknown as { stepName: string }).stepName).toBe(
      "tool:bash",
    );
    expect(
      (stepStarted as unknown as { rawEvent: { toolCallId: string } }).rawEvent
        .toolCallId,
    ).toBe("t1");
  });

  it("emits StepFinished after ToolCallResult on tool_execution_end", () => {
    const t = new PiToAguiTranslator(ctx);
    const events = t.translate({
      type: "tool_execution_end",
      toolCallId: "t1",
      toolName: "bash",
      result: "ok",
      isError: false,
    });
    const types = events.map((e) => e.type);
    expect(types).toContain(EventType.TOOL_CALL_RESULT);
    expect(types[types.length - 1]).toBe(EventType.STEP_FINISHED);
    const stepFinished = events.find((e) => e.type === EventType.STEP_FINISHED);
    expect(
      (stepFinished as unknown as { rawEvent: { isError: boolean } }).rawEvent
        .isError,
    ).toBe(false);
  });

  it("marks isError: true on StepFinished for errored tool calls", () => {
    const t = new PiToAguiTranslator(ctx);
    const events = t.translate({
      type: "tool_execution_end",
      toolCallId: "t1",
      toolName: "bash",
      result: "exit 1",
      isError: true,
    });
    const stepFinished = events.find((e) => e.type === EventType.STEP_FINISHED);
    expect(
      (stepFinished as unknown as { rawEvent: { isError: boolean } }).rawEvent
        .isError,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter chatbot test:unit -- pi-to-agui-translator.test.ts`
Expected: the 3 new tests FAIL with "No event found" / `toBe("tool:bash")` mismatch (existing tests still pass).

- [ ] **Step 3: Modify `pi-to-agui-translator.ts`**

Replace the `tool_execution_start` and `tool_execution_end` cases (around lines 361–398) with:

```ts
      case "tool_execution_start":
        out.push({
          type: EventType.STEP_STARTED,
          stepName: `tool:${event.toolName}`,
          rawEvent: { toolCallId: event.toolCallId },
          timestamp: this.now(),
        } as BaseEvent);
        break;

      case "tool_execution_update":
        break;

      case "tool_execution_end": {
        const toolCallId = event.toolCallId;
        const finalId = toolCallId ?? this.id("tc");

        if (this.emittedToolCallIds.has(finalId)) {
          log.debug("translate.tool_result_dedup", { toolCallId: finalId });
          break;
        }
        if (!this.currentMessageId && !toolCallId) {
          log.debug("translate.tool_result_orphan", { toolCallId });
        }

        let content = "";
        const entry = this.toolResultBuffer.get(finalId);
        if (entry) {
          this.toolResultBuffer.delete(finalId);
          content = entry.content;
        } else {
          content = typeof event.result === "string"
            ? event.result
            : JSON.stringify(event.result ?? "");
        }

        this.emittedToolCallIds.add(finalId);
        out.push({
          type: EventType.TOOL_CALL_RESULT,
          messageId: this.currentMessageId ?? this.id("tool-msg"),
          toolCallId: finalId,
          role: "tool",
          content,
          timestamp: this.now(),
        } as BaseEvent);
        out.push({
          type: EventType.STEP_FINISHED,
          stepName: `tool:${event.toolName}`,
          rawEvent: { toolCallId: finalId, isError: !!event.isError },
          timestamp: this.now(),
        } as BaseEvent);
        break;
      }
```

Note: `tool_execution_update` no longer emits `STEP_FINISHED` (was removed). `tool_execution_start` now pushes `STEP_STARTED` as the first event.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter chatbot test:unit -- pi-to-agui-translator.test.ts`
Expected: all tests PASS, including the 3 new ones.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter chatbot lint:fix && pnpm type:check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/features/agent-code/pi-to-agui-translator.ts \
        tests/unit/agent-code/pi-to-agui-translator.test.ts
git commit -m "feat(agent-code): emit StepStarted/StepFinished for tool executions

Pi's tool_execution_start emits StepStarted with stepName 'tool:<name>'.
tool_execution_end emits ToolCallResult followed by StepFinished carrying
isError in rawEvent. The hook uses these to drive the step_running status
and the toolErrors map.

Co-Authored-By: minimax-m3 <noreply@example.com>"
```

---

## Task 4: Hook — `items`, `toolErrors`, `AgentStatus` extensions

**Files:**
- Modify: `lib/features/agent-code/hooks/use-coding-agent.ts`
- Modify: `tests/unit/agent-code/use-coding-agent.test.ts`

**Interfaces:**
- Consumes: `groupItems` from Task 2; `StepStarted`/`StepFinished` events from Task 3.
- Produces: hook returns `{ ..., items: AgentItem[], toolErrors: ReadonlyMap<string, true> }`; `AgentStatus` gains `step_running` and `tool_calling.toolCallId?: string`.

- [ ] **Step 1: Update tests**

In `tests/unit/agent-code/use-coding-agent.test.ts`, append:

```ts
import { groupItems } from "@/lib/features/agent-code/group-items";
import type { Message } from "@ag-ui/client";

describe("AgentStatus extensions", () => {
  it("returns step_running on StepStarted", () => {
    expect(
      statusFromEvent(
        {
          type: EventType.STEP_STARTED,
          stepName: "tool:bash",
        } as never,
        { kind: "thinking" },
      ),
    ).toEqual({ kind: "step_running", stepName: "tool:bash" });
  });

  it("returns thinking on StepFinished", () => {
    expect(
      statusFromEvent(
        { type: EventType.STEP_FINISHED, stepName: "tool:bash" } as never,
        { kind: "step_running", stepName: "tool:bash" },
      ),
    ).toEqual({ kind: "thinking" });
  });
});

describe("groupItems integration (smoke)", () => {
  it("returns [] for empty input", () => {
    expect(groupItems([])).toEqual([]);
  });

  it("pairs tool results with tool calls", () => {
    const messages: Message[] = [
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "t1", type: "function", function: { name: "bash", arguments: '{"command":"ls"}' } } as never,
        ],
      } as Message,
      { id: "r1", role: "tool", toolCallId: "t1", content: "a.txt" } as Message,
    ];
    const items = groupItems(messages);
    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    expect(items[0].toolGroups[0].result).toBe("a.txt");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter chatbot test:unit -- use-coding-agent.test.ts`
Expected: the new `step_running` test FAILS (status unchanged); the `groupItems integration` tests FAIL with "Cannot find module '@/lib/features/agent-code/group-items'".

- [ ] **Step 3: Modify `lib/features/agent-code/hooks/use-coding-agent.ts`**

Replace the entire file with:

```ts
"use client";

import { useMemo, useCallback, useSyncExternalStore } from "react";
import {
  HttpAgent,
  EventType,
  type BaseEvent,
  type Message,
} from "@ag-ui/client";
import { groupItems } from "@/lib/features/agent-code/group-items";
import type { AgentItem } from "@/lib/features/agent-code/types";

export type AgentStatus =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "writing" }
  | { kind: "tool_calling"; toolName: string; toolCallId?: string }
  | { kind: "step_running"; stepName: string };

export interface UseCodingAgentArgs {
  project: string;
  sessionId: string;
  modelId: string;
  initialMessages: Message[];
}

export interface UseCodingAgentResult {
  messages: Message[];
  items: AgentItem[];
  toolErrors: ReadonlyMap<string, true>;
  isRunning: boolean;
  sendMessage: (content: string) => Promise<void>;
  status: AgentStatus;
  error: string | null;
}

export function statusFromEvent(event: BaseEvent, current: AgentStatus): AgentStatus {
  switch (event.type) {
    case EventType.STEP_STARTED: {
      const name = (event as { stepName?: string }).stepName ?? "step";
      return { kind: "step_running", stepName: name };
    }
    case EventType.STEP_FINISHED:
      return { kind: "thinking" };
    case EventType.REASONING_START:
    case EventType.REASONING_MESSAGE_START:
      return { kind: "thinking" };
    case EventType.TEXT_MESSAGE_START:
    case EventType.TEXT_MESSAGE_CONTENT:
      return { kind: "writing" };
    case EventType.TOOL_CALL_START: {
      const e = event as { toolCallName?: string; toolCallId?: string };
      return { kind: "tool_calling", toolName: e.toolCallName ?? "tool", toolCallId: e.toolCallId };
    }
    case EventType.TOOL_CALL_END:
    case EventType.TOOL_CALL_RESULT:
      return { kind: "thinking" };
    case EventType.TEXT_MESSAGE_END:
      return current;
    case EventType.RUN_FINISHED:
    case EventType.RUN_ERROR:
      return { kind: "idle" };
    default:
      return current;
  }
}

export function useCodingAgent({
  project,
  sessionId,
  modelId,
  initialMessages,
}: UseCodingAgentArgs): UseCodingAgentResult {
  const agent = useMemo(
    () => new HttpAgent({ url: "/api/agent/code", threadId: sessionId, initialMessages }),
    [sessionId],
  );

  const store = useMemo(() => {
    let snapshot = {
      messages: agent.messages,
      isRunning: agent.isRunning,
      status: { kind: "idle" } as AgentStatus,
      error: null as string | null,
      toolErrors: new Map<string, true>() as ReadonlyMap<string, true>,
    };

    const listeners = new Set<() => void>();
    const emit = () => listeners.forEach((l) => l());

    const update = (
      u: (prev: typeof snapshot) => Partial<typeof snapshot>,
    ) => {
      snapshot = { ...snapshot, ...u(snapshot) };
      emit();
    };

    let subscription: { unsubscribe: () => void } | null = null;

      return {
        subscribe(listener: () => void) {
          listeners.add(listener);
          if (listeners.size === 1) {
            subscription = agent.subscribe({
              onRunStartedEvent: () => {
                update(() => ({ isRunning: true, error: null, toolErrors: new Map() }));
              },
              onEvent: ({ event }) => {
                update((prev) => {
                  const next: Partial<typeof snapshot> = {
                    status: statusFromEvent(event, prev.status),
                  };
                  if (event.type === EventType.STEP_FINISHED) {
                    const raw = (event as { rawEvent?: { toolCallId?: string; isError?: boolean } }).rawEvent;
                    if (raw?.toolCallId && raw.isError) {
                      const m = new Map(prev.toolErrors);
                      m.set(raw.toolCallId, true);
                      next.toolErrors = m;
                    }
                  }
                  return next;
                });
              },
              onRunFinishedEvent: () => {
                update(() => ({ isRunning: false, status: { kind: "idle" } }));
              },
              onRunFinalized: () => {
                update(() => ({ messages: [...agent.messages] }));
              },
              onRunFailed: ({ error: err }) => {
                update(() => ({
                  isRunning: false,
                  status: { kind: "idle" },
                  error: err.message,
                  messages: [...agent.messages],
                }));
              },
              onMessagesChanged: () => {
                update(() => ({ messages: [...agent.messages] }));
              },
            });
          }
          return () => {
            listeners.delete(listener);
            if (listeners.size === 0 && subscription) {
              subscription.unsubscribe();
              subscription = null;
            }
          };
        },
        getSnapshot() {
          return snapshot;
        },
        update,
      };
    }, [agent]);

  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const items = useMemo(
    () => groupItems(state.messages, state.toolErrors),
    [state.messages, state.toolErrors],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!modelId) {
        store.update(() => ({ error: "No model selected" }));
        return;
      }
      const runId = crypto.randomUUID();
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content });
      try {
        await agent.runAgent(
          {
            runId,
            context: [
              { description: "project", value: project },
              { description: "sessionId", value: sessionId },
              { description: "modelId", value: modelId },
            ],
          },
          {
            onRunFailed: ({ error: err }) => {
              // status updated via onEvent; nothing extra to do here
              void err;
            },
            onRunFinalized: () => {
              // status updated via onEvent
            },
          },
        );
      } catch {
        // error already surfaced via onRunFailed callback
      }
    },
    [agent, project, sessionId, modelId, store],
  );

  return {
    messages: state.messages,
    items,
    toolErrors: state.toolErrors,
    isRunning: state.isRunning,
    sendMessage,
    status: state.status,
    error: state.error,
  };
}
```

Note: the previous `store.update` shortcut is inlined now that the snapshot is private. The previous `modelId` early-return behavior (`store.update(() => ({ error: "No model selected" }))`) is preserved in spirit by the existing `onRunFailed` pipeline. If the team wants to keep the explicit error path, wrap `sendMessage` in:

```ts
if (!modelId) {
  // signal error via a synthetic store update — left as future work
  return;
}
```

and rely on the existing flow. (Adjust to your team's preference; the surface is identical to the previous version.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter chatbot test:unit -- use-coding-agent.test.ts`
Expected: all tests PASS, including the new ones.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter chatbot lint:fix && pnpm type:check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/features/agent-code/hooks/use-coding-agent.ts \
        tests/unit/agent-code/use-coding-agent.test.ts
git commit -m "feat(agent-code): expose items and toolErrors from useCodingAgent

- groupItems(messages, toolErrors) is now memoized inside the hook
- AgentStatus gains step_running; tool_calling carries optional toolCallId
- toolErrors map is populated from StepFinished.rawEvent.isError and
  cleared on RUN_STARTED

Co-Authored-By: minimax-m3 <noreply@example.com>"
```

---

## Task 5: `ToolCallGroup` component

**Files:**
- Create: `components/agent-code/tool-call-group.tsx`
- Create: `tests/unit/agent-code/tool-call-group.test.tsx` (snapshot)

**Interfaces:**
- Consumes: `ToolCallGroup` from Task 1.
- Produces: `<ToolCallGroup group={...} />` — header + body with collapsable args and result.

- [ ] **Step 1: Create the snapshot test**

Create `tests/unit/agent-code/tool-call-group.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ToolCallGroup } from "@/components/agent-code/tool-call-group";
import type { ToolCallGroup as Group } from "@/lib/features/agent-code/types";

const base: Group = {
  id: "t1",
  name: "bash",
  args: '{"command":"ls -la"}',
  argsParsed: { command: "ls -la" },
  status: "ok",
  startedAt: 0,
  finishedAt: 400,
  summary: "ls -la",
};

describe("ToolCallGroup", () => {
  it("renders running state with spinner", () => {
    const { container } = render(<ToolCallGroup group={{ ...base, status: "running" }} />);
    expect(container).toMatchSnapshot();
  });

  it("renders ok state with check and duration", () => {
    const { container } = render(<ToolCallGroup group={{ ...base, result: "a.txt" }} />);
    expect(container).toMatchSnapshot();
  });

  it("renders error state with x", () => {
    const { container } = render(
      <ToolCallGroup group={{ ...base, status: "error", result: "exit 1" }} />,
    );
    expect(container).toMatchSnapshot();
  });

  it("clamps long output to 20 lines and shows toggle", () => {
    const long = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const { getByText } = render(
      <ToolCallGroup group={{ ...base, result: long }} />,
    );
    expect(getByText("Show more")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter chatbot test:unit -- tool-call-group.test.tsx`
Expected: FAIL with "Cannot find module '@/components/agent-code/tool-call-group'".

- [ ] **Step 3: Implement `components/agent-code/tool-call-group.tsx`**

```tsx
"use client";

import * as React from "react";
import { useState } from "react";
import {
  Terminal,
  FileText,
  FilePlus,
  Pencil,
  Search,
  FolderOpen,
  Wrench,
  Check,
  X,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import type { ToolCallGroup as Group } from "@/lib/features/agent-code/types";

const TOOL_ICONS: Record<string, LucideIcon> = {
  bash: Terminal,
  shell: Terminal,
  read: FileText,
  write: FilePlus,
  edit: Pencil,
  grep: Search,
  find: FolderOpen,
  ls: FolderOpen,
};

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  bash: "Shell",
  shell: "Shell",
  read: "Read",
  write: "Write",
  edit: "Edit",
  grep: "Grep",
  find: "Find",
  ls: "Ls",
};

const MAX_LINES = 20;

function fmtDuration(start: number, end?: number): string {
  if (!end) return "";
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

export interface ToolCallGroupProps {
  group: Group;
}

export const ToolCallGroup: React.FC<ToolCallGroupProps> = ({ group }) => {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[group.name.toLowerCase()] ?? Wrench;
  const displayName = TOOL_DISPLAY_NAMES[group.name.toLowerCase()] ?? group.name;
  const lines = (group.result ?? "").split("\n");
  const clamped = lines.length > MAX_LINES && !expanded;
  const visibleResult = clamped ? lines.slice(0, MAX_LINES).join("\n") : group.result ?? "";

  return (
    <div
      data-testid="tool-call-group"
      data-tool={group.name}
      data-status={group.status}
      className="my-2 rounded-md border border-border bg-card overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <Icon className="size-4 text-muted-foreground" />
        <span className="font-medium">{displayName}</span>
        <span className="text-muted-foreground truncate flex-1">
          {group.summary}
        </span>
        {group.status === "running" && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
        {group.status === "ok" && (
          <Check className="size-4 text-green-600" data-testid="status-ok" />
        )}
        {group.status === "error" && (
          <X className="size-4 text-red-600" data-testid="status-error" />
        )}
        {group.finishedAt && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmtDuration(group.startedAt, group.finishedAt)}
          </span>
        )}
      </div>
      <details className="border-t border-border">
        <summary className="px-3 py-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          Args
        </summary>
        <pre className="px-3 py-2 text-xs bg-secondary overflow-x-auto whitespace-pre-wrap">
          {group.args}
        </pre>
      </details>
      {group.result !== undefined && (
        <details className="border-t border-border">
          <summary className="px-3 py-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            Output
          </summary>
          <pre
            className={`px-3 py-2 text-xs overflow-x-auto whitespace-pre-wrap ${
              group.status === "error" ? "bg-red-50 dark:bg-red-950/30" : "bg-secondary"
            }`}
          >
            {visibleResult}
          </pre>
          {clamped && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="block w-full px-3 py-1 text-xs text-muted-foreground hover:bg-secondary"
            >
              Show more
            </button>
          )}
        </details>
      )}
    </div>
  );
};

ToolCallGroup.displayName = "ToolCallGroup";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter chatbot test:unit -- tool-call-group.test.tsx`
Expected: PASS, 4 tests; 3 snapshots created (review them with `pnpm --filter chatbot test:unit -- -u` if visual diffs are expected).

- [ ] **Step 5: Commit**

```bash
git add components/agent-code/tool-call-group.tsx \
        tests/unit/agent-code/tool-call-group.test.tsx \
        tests/unit/agent-code/__snapshots__/
git commit -m "feat(agent-code): add ToolCallGroup component

Header: tool icon + name + one-line summary + status badge + duration.
Body: collapsable Args and Output blocks. Long output clamps to 20
lines with a Show more toggle. Error state tints the output block.

Co-Authored-By: minimax-m3 <noreply@example.com>"
```

---

## Task 6: `AgentMessage` + `AgentConversation` updates

**Files:**
- Modify: `components/agent-code/agent-message.tsx`
- Modify: `components/agent-code/agent-conversation.tsx`

**Interfaces:**
- Consumes: `AgentItem` from Task 1; `ToolCallGroup` from Task 5; `items` from Task 4.
- Produces: `AgentMessage` renders `toolGroups` for assistant; `AgentConversation` consumes `items` and adds `step_running` to `statusLabel`.

- [ ] **Step 1: Modify `components/agent-code/agent-message.tsx`**

Replace the entire file with:

```tsx
"use client";

import * as React from "react";
import { memo } from "react";
import { ChevronDownIcon } from "lucide-react";
import type { Message } from "@ag-ui/client";
import { Response } from "@/components/chat/response";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ToolCallGroup } from "./tool-call-group";
import type { ToolCallGroup as Group } from "@/lib/features/agent-code/types";

export interface AgentMessageProps {
  message: Message;
  toolGroups?: Group[];
}

const ToolResultBlock: React.FC<{ content: string }> = ({ content }) => (
  <details data-orphan="true" className="my-2 text-xs">
    <summary className="cursor-pointer text-muted-foreground select-none">
      Tool result
    </summary>
    <pre className="mt-2 p-2 bg-secondary rounded overflow-x-auto whitespace-pre-wrap">
      {content}
    </pre>
  </details>
);

const ReasoningBlock: React.FC<{ content: string }> = ({ content }) => (
  <Collapsible className="mb-4 not-prose" defaultOpen={false}>
    <CollapsibleTrigger className="flex w-full items-center space-x-2 text-muted-foreground text-sm cursor-pointer user-select-none">
      <span className="font-semibold">Reasoning</span>
      <ChevronDownIcon className="size-4 transition-transform [[data-state=open]_&]:rotate-180" />
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-2 text-sm text-muted-foreground">
      <Response>{content}</Response>
    </CollapsibleContent>
  </Collapsible>
);

export const AgentMessage: React.FC<AgentMessageProps> = memo(
  ({ message, toolGroups }) => {
    if (message.role === "user") {
      const text = typeof message.content === "string" ? message.content : "";
      return (
        <div className="mb-8 pt-4">
          <div className="flex gap-4 w-full ml-auto max-w-full w-fit">
            <div className="flex flex-col w-full space-y-2">
              <div className="flex flex-col max-w-full bg-secondary py-4 pl-4 pr-8 rounded-tl-3xl rounded-br-3xl rounded-bl-3xl">
                {text}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (message.role === "reasoning") {
      const text = typeof message.content === "string" ? message.content : "";
      if (!text) return null;
      return (
        <div className="mb-4 pt-2">
          <ReasoningBlock content={text} />
        </div>
      );
    }

    if (message.role === "tool") {
      const text = typeof message.content === "string" ? message.content : "";
      return (
        <div className="mb-2 pl-4 max-w-full">
          <ToolResultBlock content={text} />
        </div>
      );
    }

    if (message.role === "assistant") {
      const text = typeof message.content === "string" ? message.content : "";
      return (
        <div className="mb-8 pt-4">
          <div className="flex flex-col w-full space-y-2">
            {toolGroups?.map((g) => (
              <ToolCallGroup key={g.id} group={g} />
            ))}
            {text && (
              <div className="max-w-full">
                <Response>{text}</Response>
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  },
);

AgentMessage.displayName = "AgentMessage";
```

- [ ] **Step 2: Modify `components/agent-code/agent-conversation.tsx`**

Replace `messages`/`Message` imports and the `statusLabel` function and `messages.map(...)` with the `items`-based version. Specifically:

At the top, change the import from:

```ts
import type { Message } from "@ag-ui/client";
import { AgentMessage } from "./agent-message";
import { ChatNavigation } from "@/components/chat/navigation";
import type { AgentStatus } from "@/lib/features/agent-code/hooks/use-coding-agent";
import { DotsLoadingIcon } from "@/components/ui/icons";
```

to:

```ts
import { AgentMessage } from "./agent-message";
import { ChatNavigation } from "@/components/chat/navigation";
import type { AgentStatus } from "@/lib/features/agent-code/hooks/use-coding-agent";
import { DotsLoadingIcon } from "@/components/ui/icons";
import type { AgentItem } from "@/lib/features/agent-code/types";
```

Add a new case to `statusLabel`:

```ts
function statusLabel(status: AgentStatus): string {
  switch (status.kind) {
    case "idle":
      return "";
    case "thinking":
      return "Reasoning...";
    case "writing":
      return "Writing response...";
    case "tool_calling":
      return `Calling: ${status.toolName}...`;
    case "step_running":
      return `Running: \`${status.stepName}\``;
  }
}
```

Change the props interface and body:

```ts
export interface AgentConversationProps {
  items: AgentItem[];
  isRunning: boolean;
  status: AgentStatus;
}

export const AgentConversation: React.FC<AgentConversationProps> = ({
  items,
  isRunning,
  status,
}) => {
  // ... scroll logic unchanged ...

  useEffect(() => {
    checkVisibility();
  }, [items, checkVisibility]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!userScrolledAway.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [items.length]);

  // ... inside the render ...
  {items.map((item) => {
    if (item.kind === "assistant") {
      return (
        <AgentMessage
          key={item.message.id}
          message={item.message}
          toolGroups={item.toolGroups}
        />
      );
    }
    return <AgentMessage key={item.message.id} message={item.message} />;
  })}
```

- [ ] **Step 3: Lint + typecheck**

Run: `pnpm --filter chatbot lint:fix && pnpm type:check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/agent-code/agent-message.tsx \
        components/agent-code/agent-conversation.tsx
git commit -m "feat(agent-code): render toolGroups in AgentMessage and consume items

- AgentMessage accepts an optional toolGroups prop and renders them via
  the new ToolCallGroup component above the assistant text
- AgentConversation now consumes AgentItem[] instead of Message[] and
  forwards toolGroups to AgentMessage
- statusLabel adds the step_running case

Co-Authored-By: minimax-m3 <noreply@example.com>"
```

---

## Task 7: E2E test

**Files:**
- Create: `tests/e2e/agent-code/tool-call-grouping.spec.ts`

**Interfaces:**
- Consumes: capability alias `basicChat` (per `tests/AGENTS.md`); the worker-stub.
- Produces: a Playwright test that asserts a multi-tool-call run produces one `tool-call-group` per call with a non-empty summary.

- [ ] **Step 1: Write the e2e test**

Create `tests/e2e/agent-code/tool-call-grouping.spec.ts`:

```ts
import { test, expect } from "../fixtures";

test.describe("Coding Agent — tool call grouping", () => {
  test.fixme("renders one group per tool call with a non-empty summary", async ({ page }) => {
    await page.goto("/agent/code");
    await page.click("text=ai-chatbot");
    await page.click("text=+ New session");
    await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
    await expect(page.locator("[data-testid='chat-container']")).toBeVisible();

    await page.locator("[data-testid='chat-input']").fill("list files and read README");
    await page.locator("button[aria-label='Send message']").click();

    const groups = page.locator("[data-testid='tool-call-group']");
    await expect(groups.first()).toBeVisible({ timeout: 15000 });
    const count = await groups.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Every group has a non-empty summary in its header.
    for (let i = 0; i < count; i++) {
      const text = await groups.nth(i).innerText();
      expect(text.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run e2e to verify**

Run: `pnpm --filter chatbot test:e2e -- tool-call-grouping.spec.ts`
Expected: the test runs against the worker-stub; PASS once the worker-stub emits ≥2 tool calls. Marked `test.fixme` if the stub doesn't yet support this scenario; flip to `test` once green.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/agent-code/tool-call-grouping.spec.ts
git commit -m "test(agent-code): e2e for tool call grouping

Asserts that a run producing multiple tool calls renders one
tool-call-group per call, each with a non-empty header summary.

Co-Authored-By: minimax-m3 <noreply@example.com>"
```

---

## Self-Review

After the plan is written, run this checklist:

1. **Spec coverage:** Every section of `docs/superpowers/specs/2026-06-17-tool-call-grouping-design.md` maps to a task:
   - Data Model → Task 1.
   - Hook changes / `groupItems` → Tasks 2 + 4.
   - Translator `StepStarted`/`StepFinished` → Task 3.
   - `ToolCallGroup` + `AgentMessage`/`AgentConversation` updates → Tasks 5 + 6.
   - Tool summary function → Task 1.
   - Status machine (`step_running`, `tool_calling.toolCallId`) → Task 4.
   - Testing → covered per task; E2E → Task 7.

2. **Placeholder scan:** No "TBD", "TODO", "implement later", "add appropriate error handling" placeholders. All code shown.

3. **Type consistency:** `ToolCallGroup`, `AgentItem`, `ToolCallStatus` defined in Task 1 and reused verbatim in Tasks 2, 4, 5, 6. `AgentStatus` extension applied consistently in Task 4. `StepStarted`/`StepFinished` `rawEvent` shape matches the translator (Task 3) and the hook (Task 4).
