# Coding Agent Streaming Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three streaming UI bugs in the coding agent (duplicated text during streaming, missing line breaks, status indicators that disappear) by producing a real AG-UI event stream from the worker and letting the client use the natural `messages[]` state model that `@ag-ui/client` already implements.

**Architecture:** Two coordinated changes. (1) The `pi-to-agui-translator` in the worker is rewritten to emit the full AG-UI event protocol — `TEXT_MESSAGE_START`/`CONTENT`/`END`, `TOOL_CALL_START`/`ARGS`/`END`/`RESULT`, `REASONING_*` — with a unique `messageId` per assistant message. (2) The `useCodingAgent` hook in the client stops maintaining a custom `steps[]` + `streamingContent` view and instead lets `HttpAgent` accumulate `messages[]` natively, exposing them through a new hook result shape. The `AgentConversation` component is updated to render the `messages[]` array instead of step badges + a streaming bubble.

**Tech Stack:** TypeScript, React 19, `@ag-ui/client` 0.0.57, `@ag-ui/core` 0.0.57, `@earendil-works/pi-coding-agent` 0.79.3, Vitest, Playwright.

---

## File Structure

### New files

- `packages/chatbot/tests/unit/agent-code/pi-to-agui-translator.test.ts` — REWRITE: full coverage of all Pi→AG-UI event translations.
- `packages/chatbot/lib/features/agent-code/agent-message.ts` — extend with reasoning/tool variants (or a new file `agent-parts.tsx` if split is cleaner).
- `packages/chatbot/tests/unit/agent-code/use-coding-agent.test.ts` — NEW: tests the pure `statusFromEvent` helper exported from the hook file (no React rendering, no fetch).

### Modified files

- `packages/chatbot/lib/features/agent-code/pi-to-agui-translator.ts` — REWRITE: full AG-UI protocol emission, stateful across `message_start`/`message_end` boundaries.
- `packages/chatbot/lib/features/agent-code/hooks/use-coding-agent.ts` — REWRITE: stop custom state model; let `HttpAgent` accumulate `messages[]`; expose `messages`, `isRunning`, `status` (current phase label), `error`.
- `packages/chatbot/components/agent-code/agent-conversation.tsx` — REWRITE: render `messages[]` from the hook instead of `steps[]` + `streamingContent`. Show a small live status indicator while a run is in progress. Reuse `Response` for text and a simple inline `bash`/`read` label for tool calls.
- `packages/chatbot/components/agent-code/agent-message.tsx` — UPDATE: render a single `AgentMessage` per message; handle `role: "user" | "assistant" | "tool" | "reasoning"`.

### Unchanged files (sanity)

- `packages/chatbot/app/(chat)/api/agent/code/route.ts` — already passes through events unchanged; the translator is the only place that needs to change.
- `packages/chatbot/app/(chat)/api/agent/code/worker-stub/rpc/route.ts` — stub worker; the existing `text_delta` flow should still produce a visible message after the refactor (one test will assert this).
- `packages/chatbot/components/agent-code/agent-code-chat.tsx` — only prop shape changes (`messages` instead of `steps`/`streamingContent`).
- `packages/chatbot/tests/e2e/agent-code/agent-code.spec.ts` — should keep passing without changes; the visible text "Hello from stub" still appears.

---

## Task 1: Extend `pi-to-agui-translator` to emit full AG-UI protocol

**Files:**
- Modify: `packages/chatbot/lib/features/agent-code/pi-to-agui-translator.ts`
- Test: `packages/chatbot/tests/unit/agent-code/pi-to-agui-translator.test.ts`

The translator currently takes one Pi event and returns one AG-UI event. To emit proper `TEXT_MESSAGE_START`/`END` and `TOOL_CALL_START`/`END` with stable IDs, it must be stateful: it needs to know the `messageId` for the current assistant message across `message_start` → many `message_update` → `message_end`. Refactor it into a class that holds the current `messageId` and emits the right AG-UI events for the full lifecycle.

The public API: `class PiToAguiTranslator { translate(piEvent): BaseEvent[] }` — returns one or more AG-UI events (e.g. a `text_start` + `text_end` together if no deltas came in between, or zero events for events that should be ignored). The current call site in `app/(chat)/api/agent/code/route.ts:120-123` changes to `for (const ev of translator.translate(piEvent)) controller.enqueue(...)`.

### Step 1.1: Write failing tests for the new translator

Replace the contents of `packages/chatbot/tests/unit/agent-code/pi-to-agui-translator.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { EventType } from "@ag-ui/client";
import { PiToAguiTranslator } from "@/lib/features/agent-code/pi-to-agui-translator";

const ctx = { threadId: "thread-1", runId: "run-1" };

function types(events: Array<{ type: string }>) {
  return events.map((e) => e.type);
}

describe("pi-to-agui-translator", () => {
  it("translates agent_start to RUN_STARTED", () => {
    const t = new PiToAguiTranslator(ctx);
    expect(types(t.translate({ type: "agent_start" }))).toEqual([
      EventType.RUN_STARTED,
    ]);
  });

  it("translates agent_end to RUN_FINISHED", () => {
    const t = new PiToAguiTranslator(ctx);
    expect(types(t.translate({ type: "agent_end" }))).toEqual([
      EventType.RUN_FINISHED,
    ]);
  });

  it("emits TEXT_MESSAGE_START, CONTENT, END across one assistant message", () => {
    const t = new PiToAguiTranslator(ctx);
    const messageId = "msg-1";

    const start = t.translate({
      type: "message_start",
      message: { role: "assistant" },
    });
    const delta = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hi" },
    });
    const end = t.translate({
      type: "message_end",
      message: { role: "assistant" },
    });

    expect(types(start)).toEqual([EventType.TEXT_MESSAGE_START]);
    expect((start[0] as { messageId: string }).messageId).toBe(messageId);
    expect(types(delta)).toEqual([EventType.TEXT_MESSAGE_CONTENT]);
    expect((delta[0] as { messageId: string; delta: string }).messageId).toBe(
      messageId,
    );
    expect((delta[0] as { messageId: string; delta: string }).delta).toBe("Hi");
    expect(types(end)).toEqual([EventType.TEXT_MESSAGE_END]);
    expect((end[0] as { messageId: string }).messageId).toBe(messageId);
  });

  it("emits REASONING_* for thinking_delta and closes the reasoning block on text_start", () => {
    const t = new PiToAguiTranslator(ctx);

    const thinkingDelta = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "thinking_delta",
        contentIndex: 0,
        delta: "hmm",
      },
    });
    const textStart = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 1 },
    });
    const textDelta = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "ok" },
    });

    expect(types(thinkingDelta)).toEqual([
      EventType.REASONING_MESSAGE_CONTENT,
    ]);
    expect(types(textStart)).toEqual([
      EventType.REASONING_MESSAGE_END,
      EventType.TEXT_MESSAGE_START,
    ]);
    expect(types(textDelta)).toEqual([EventType.TEXT_MESSAGE_CONTENT]);
  });

  it("emits TOOL_CALL_START/ARGS/END inside an assistant message and TOOL_CALL_RESULT on tool_execution_end", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({ type: "message_start", message: { role: "assistant" } });
    t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 0 },
    });
    const tcStart = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_start",
        contentIndex: 1,
        toolCall: { id: "tc-1", name: "bash" },
      },
    });
    const tcDelta = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_delta",
        contentIndex: 1,
        delta: '{"command":"ls"}',
      },
    });
    const tcEnd = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_end",
        contentIndex: 1,
        toolCall: { id: "tc-1", name: "bash" },
      },
    });
    t.translate({ type: "message_end", message: { role: "assistant" } });
    const result = t.translate({
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "bash",
      result: "ok",
      isError: false,
    });

    expect(types(tcStart)).toEqual([EventType.TOOL_CALL_START]);
    expect((tcStart[0] as { toolCallId: string }).toolCallId).toBe("tc-1");
    expect((tcStart[0] as { parentMessageId?: string }).parentMessageId).toBe(
      "msg-1",
    );
    expect(types(tcDelta)).toEqual([EventType.TOOL_CALL_ARGS]);
    expect((tcDelta[0] as { toolCallId: string; delta: string }).delta).toBe(
      '{"command":"ls"}',
    );
    expect(types(tcEnd)).toEqual([EventType.TOOL_CALL_END]);
    expect(types(result)).toEqual([EventType.TOOL_CALL_RESULT]);
    expect((result[0] as { toolCallId: string; content: string }).content).toBe(
      "ok",
    );
  });

  it("uses a fresh messageId for each new assistant message across turns", () => {
    const t = new PiToAguiTranslator(ctx);
    const first = t.translate({
      type: "message_start",
      message: { role: "assistant" },
    });
    const firstMessageId = (first[0] as { messageId: string }).messageId;
    t.translate({ type: "message_end", message: { role: "assistant" } });
    const second = t.translate({
      type: "message_start",
      message: { role: "assistant" },
    });
    const secondMessageId = (second[0] as { messageId: string }).messageId;
    expect(secondMessageId).not.toBe(firstMessageId);
  });
});
```

### Step 1.2: Run tests to confirm they fail

Run: `cd /home/javier/projects/ai-chatbot/packages/chatbot && npx vitest run tests/unit/agent-code/pi-to-agui-translator.test.ts`

Expected: FAIL — `PiToAguiTranslator` is not exported as a class yet (current export is a function `translatePiEvent`).

### Step 1.3: Rewrite the translator

Replace the contents of `packages/chatbot/lib/features/agent-code/pi-to-agui-translator.ts` with:

```ts
import { EventType, type BaseEvent } from "@ag-ui/client";
import { getTraceLogger } from "tracing";

type AssistantEvent =
  | { type: "start"; partial: unknown }
  | { type: "text_start"; contentIndex: number; partial: unknown }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: unknown }
  | { type: "text_end"; contentIndex: number; content: string; partial: unknown }
  | {
      type: "thinking_start";
      contentIndex: number;
      partial: unknown;
    }
  | {
      type: "thinking_delta";
      contentIndex: number;
      delta: string;
      partial: unknown;
    }
  | {
      type: "thinking_end";
      contentIndex: number;
      content: string;
      partial: unknown;
    }
  | { type: "toolcall_start"; contentIndex: number; toolCall?: { id: string; name: string } }
  | { type: "toolcall_delta"; contentIndex: number; delta: string }
  | { type: "toolcall_end"; contentIndex: number; toolCall?: { id: string; name: string } }
  | { type: "done"; message: unknown }
  | { type: "error"; error: unknown };

type PiEvent =
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "turn_start" }
  | { type: "turn_end" }
  | { type: "message_start"; message?: { id?: string } }
  | { type: "message_end"; message?: { id?: string } }
  | {
      type: "message_update";
      assistantMessageEvent: AssistantEvent;
    }
  | { type: "tool_execution_start"; toolCallId?: string; toolName: string }
  | { type: "tool_execution_update"; toolCallId?: string }
  | {
      type: "tool_execution_end";
      toolCallId?: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  | { type: "error"; message: string };

export interface TranslatorContext {
  threadId: string;
  runId: string;
}

/**
 * Stateful translator from Pi SDK events to AG-UI events.
 *
 * One instance per run. Tracks the current assistant `messageId` and any open
 * reasoning/tool-call IDs so a stream of `message_update` sub-events can be
 * expanded into the matching AG-UI START / CONTENT / END triplets.
 */
export class PiToAguiTranslator {
  private currentMessageId: string | null = null;
  private currentReasoningId: string | null = null;
  private openToolCallIds = new Set<string>();
  private counter = 0;

  constructor(private readonly context: TranslatorContext) {}

  private id(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  private now(): number {
    return Date.now();
  }

  translate(event: PiEvent): BaseEvent[] {
    const log = getTraceLogger("bridge");
    const { threadId, runId } = this.context;
    const out: BaseEvent[] = [];

    switch (event.type) {
      case "agent_start":
        out.push({
          type: EventType.RUN_STARTED,
          threadId,
          runId,
          timestamp: this.now(),
        } as BaseEvent);
        break;

      case "agent_end":
        out.push({
          type: EventType.RUN_FINISHED,
          threadId,
          runId,
          timestamp: this.now(),
        } as BaseEvent);
        break;

      case "message_start": {
        this.currentMessageId = this.id("msg");
        out.push({
          type: EventType.TEXT_MESSAGE_START,
          messageId: this.currentMessageId,
          role: "assistant",
          timestamp: this.now(),
        } as BaseEvent);
        break;
      }

      case "message_end": {
        if (this.currentMessageId) {
          if (this.currentReasoningId) {
            out.push({
              type: EventType.REASONING_MESSAGE_END,
              messageId: this.currentReasoningId,
              timestamp: this.now(),
            } as BaseEvent);
            out.push({
              type: EventType.REASONING_END,
              messageId: this.currentReasoningId,
              timestamp: this.now(),
            } as BaseEvent);
            this.currentReasoningId = null;
          }
          for (const toolCallId of this.openToolCallIds) {
            out.push({
              type: EventType.TOOL_CALL_END,
              toolCallId,
              timestamp: this.now(),
            } as BaseEvent);
          }
          this.openToolCallIds.clear();
          out.push({
            type: EventType.TEXT_MESSAGE_END,
            messageId: this.currentMessageId,
            timestamp: this.now(),
          } as BaseEvent);
          this.currentMessageId = null;
        }
        break;
      }

      case "message_update": {
        const ame = event.assistantMessageEvent;
        switch (ame.type) {
          case "text_start": {
            if (this.currentReasoningId) {
              out.push({
                type: EventType.REASONING_MESSAGE_END,
                messageId: this.currentReasoningId,
                timestamp: this.now(),
              } as BaseEvent);
              out.push({
                type: EventType.REASONING_END,
                messageId: this.currentReasoningId,
                timestamp: this.now(),
              } as BaseEvent);
              this.currentReasoningId = null;
            }
            break;
          }
          case "text_delta": {
            if (!this.currentMessageId) break;
            out.push({
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId: this.currentMessageId,
              delta: ame.delta,
              timestamp: this.now(),
            } as BaseEvent);
            break;
          }
          case "text_end":
            break;
          case "thinking_start": {
            if (!this.currentReasoningId) {
              this.currentReasoningId = this.id("reason");
              out.push({
                type: EventType.REASONING_START,
                messageId: this.currentReasoningId,
                timestamp: this.now(),
              } as BaseEvent);
              out.push({
                type: EventType.REASONING_MESSAGE_START,
                messageId: this.currentReasoningId,
                role: "assistant",
                timestamp: this.now(),
              } as BaseEvent);
            }
            break;
          }
          case "thinking_delta": {
            if (!this.currentReasoningId) {
              this.currentReasoningId = this.id("reason");
              out.push({
                type: EventType.REASONING_START,
                messageId: this.currentReasoningId,
                timestamp: this.now(),
              } as BaseEvent);
              out.push({
                type: EventType.REASONING_MESSAGE_START,
                messageId: this.currentReasoningId,
                role: "assistant",
                timestamp: this.now(),
              } as BaseEvent);
            }
            out.push({
              type: EventType.REASONING_MESSAGE_CONTENT,
              messageId: this.currentReasoningId,
              delta: ame.delta,
              timestamp: this.now(),
            } as BaseEvent);
            break;
          }
          case "thinking_end":
            break;
          case "toolcall_start": {
            const toolCallId = ame.toolCall?.id ?? this.id("tc");
            this.openToolCallIds.add(toolCallId);
            out.push({
              type: EventType.TOOL_CALL_START,
              toolCallId,
              toolCallName: ame.toolCall?.name ?? "unknown",
              parentMessageId: this.currentMessageId ?? undefined,
              timestamp: this.now(),
            } as BaseEvent);
            break;
          }
          case "toolcall_delta": {
            // Find the most recent open tool call (Pi keeps one in flight per call).
            const last = [...this.openToolCallIds].at(-1);
            if (last) {
              out.push({
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: last,
                delta: ame.delta,
                timestamp: this.now(),
              } as BaseEvent);
            }
            break;
          }
          case "toolcall_end": {
            // TOOL_CALL_END is emitted on message_end to keep the lifecycle
            // symmetric with the rest of the protocol; nothing to do here.
            break;
          }
          case "done":
          case "error":
          case "start":
            break;
        }
        break;
      }

      case "tool_execution_start":
      case "tool_execution_update":
        break;

      case "tool_execution_end": {
        const toolCallId = event.toolCallId ?? this.id("tc");
        const content =
          typeof event.result === "string"
            ? event.result
            : JSON.stringify(event.result ?? "");
        out.push({
          type: EventType.TOOL_CALL_RESULT,
          messageId: this.currentMessageId ?? this.id("tool-msg"),
          toolCallId,
          role: "tool",
          content,
          timestamp: this.now(),
        } as BaseEvent);
        break;
      }

      case "turn_start":
      case "turn_end":
        break;

      case "error":
        out.push({
          type: EventType.RUN_ERROR,
          threadId,
          runId,
          message: event.message,
          timestamp: this.now(),
        } as BaseEvent);
        break;

      default:
        log.debug("translate.unknown_type", {
          piType: (event as { type: string }).type,
        });
    }

    log.debug("translate", {
      piType: event.type,
      aguiTypes: out.map((e) => e.type),
    });
    return out;
  }
}
```

### Step 1.4: Run tests to confirm they pass

Run: `cd /home/javier/projects/ai-chatbot/packages/chatbot && npx vitest run tests/unit/agent-code/pi-to-agui-translator.test.ts`

Expected: PASS — all six test cases pass.

### Step 1.5: Update the route handler to use the new translator

In `packages/chatbot/app/(chat)/api/agent/code/route.ts`, replace the `translatePiEvent` import and the call site.

Replace the import (line 10):

```ts
import { translatePiEvent } from "@/lib/features/agent-code/pi-to-agui-translator";
```

with:

```ts
import { PiToAguiTranslator } from "@/lib/features/agent-code/pi-to-agui-translator";
```

Replace the call site inside the SSE streaming loop (around line 119-125):

```ts
const piEvent = JSON.parse(line);
const aguiEvent = translatePiEvent(piEvent, {
  threadId: sessionId,
  runId,
});
log.debug("stream.event", { piType: piEvent.type, aguiType: aguiEvent.type });
controller.enqueue(encoder.encode(`data: ${JSON.stringify(aguiEvent)}\n\n`));
```

with:

```ts
const piEvent = JSON.parse(line);
const aguiEvents = translator.translate(piEvent);
for (const aguiEvent of aguiEvents) {
  log.debug("stream.event", { piType: piEvent.type, aguiType: aguiEvent.type });
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(aguiEvent)}\n\n`));
}
```

Add an instance just inside the `start(controller)` callback, after the `decoder`/`buffer` declarations (around line 104):

```ts
const translator = new PiToAguiTranslator({ threadId: sessionId, runId });
```

### Step 1.6: Run the build to confirm the route compiles

Run: `cd /home/javier/projects/ai-chatbot/packages/chatbot && npm run type:check`

Expected: PASS.

### Step 1.7: Commit

```bash
cd /home/javier/projects/ai-chatbot
git add packages/chatbot/lib/features/agent-code/pi-to-agui-translator.ts \
        packages/chatbot/app/\(chat\)/api/agent/code/route.ts \
        packages/chatbot/tests/unit/agent-code/pi-to-agui-translator.test.ts
git commit -m "feat(agent-code): emit full AG-UI event protocol from Pi translator

Replaces the stateless translatePiEvent function with a stateful
PiToAguiTranslator class that tracks the current assistant messageId
and open reasoning/tool-call IDs, emitting proper START/END events for
TEXT_MESSAGE, REASONING_MESSAGE, and TOOL_CALL triplets across
multi-turn runs."
```

---

## Task 2: Refactor `useCodingAgent` to expose `messages[]` instead of `steps`+`streamingContent`

**Files:**
- Modify: `packages/chatbot/lib/features/agent-code/hooks/use-coding-agent.ts`
- Test: `packages/chatbot/tests/unit/agent-code/use-coding-agent.test.ts` (NEW)

The hook should:
1. Instantiate `HttpAgent` from `@ag-ui/client` (already imported) and let it maintain `agent.messages[]` internally.
2. Subscribe to `onMessagesChanged` and copy `agent.messages` into local state (the hook is "use client" so a local mirror is fine).
3. Track `isRunning` via `onRunStartedEvent` / `onRunFinishedEvent` / `onRunErrorEvent`.
4. Track a lightweight `status` for the live indicator (e.g. `"thinking"`, `"calling:bash"`, `"writing"`, `"idle"`) derived from the latest event observed in `onEvent`.
5. On `onRunFinalized`, do nothing special — `agent.messages` already has the final state.
6. Persist the final assistant messages to the server using the existing `getSessionMessages` flow. **No DB write needed here** because the worker already persists via `getSessionMessages` re-reading `runtime.session.messages`. But for a clean reload we still need to fetch initial messages from the server on mount (keep the existing `loadMessages` useEffect, simplified).

The hook signature changes to:

```ts
export interface UseCodingAgentResult {
  messages: AssistantMessage[];   // @ag-ui/client message shape
  isRunning: boolean;
  sendMessage: (content: string) => Promise<void>;
  status: { kind: "idle" } | { kind: "thinking" } | { kind: "writing" } | { kind: "tool_calling"; toolName: string };
  error: string | null;
}
```

### Step 2.1: Write failing tests for the hook

The test should not require `@testing-library/react` (not currently a project dependency). Instead, extract the event-to-status reducer as a pure exported function from the same file and test it directly. The function is `statusFromEvent(event, currentStatus)` and is already defined in the rewrite in Step 2.3.

Create `packages/chatbot/tests/unit/agent-code/use-coding-agent.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { EventType } from "@ag-ui/client";
import { statusFromEvent, type AgentStatus } from "@/lib/features/agent-code/hooks/use-coding-agent";

describe("statusFromEvent", () => {
  const idle: AgentStatus = { kind: "idle" };

  it("returns idle on RUN_FINISHED", () => {
    expect(
      statusFromEvent({ type: EventType.RUN_FINISHED } as never, idle),
    ).toEqual({ kind: "idle" });
  });

  it("returns thinking on REASONING_START", () => {
    expect(
      statusFromEvent(
        { type: EventType.REASONING_START, messageId: "r1" } as never,
        idle,
      ),
    ).toEqual({ kind: "thinking" });
  });

  it("returns writing on TEXT_MESSAGE_CONTENT", () => {
    expect(
      statusFromEvent(
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: "m1",
          delta: "hi",
        } as never,
        idle,
      ),
    ).toEqual({ kind: "writing" });
  });

  it("returns tool_calling on TOOL_CALL_START and keeps the tool name", () => {
    expect(
      statusFromEvent(
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: "t1",
          toolCallName: "bash",
        } as never,
        idle,
      ),
    ).toEqual({ kind: "tool_calling", toolName: "bash" });
  });

  it("preserves current status for unrelated events", () => {
    const writing: AgentStatus = { kind: "writing" };
    expect(
      statusFromEvent(
        { type: "CUSTOM", name: "ping" } as never,
        writing,
      ),
    ).toEqual({ kind: "writing" });
  });
});
```

This test file does not need React. The full hook integration is covered by the e2e test in Task 5.

### Step 2.2: Run tests to confirm they fail

Run: `cd /home/javier/projects/ai-chatbot/packages/chatbot && npx vitest run tests/unit/agent-code/use-coding-agent.test.ts`

Expected: FAIL — `useCodingAgent` does not yet expose `messages`/`status`/`error` in this shape.

### Step 2.3: Rewrite the hook

Replace the contents of `packages/chatbot/lib/features/agent-code/hooks/use-coding-agent.ts` with:

```ts
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  HttpAgent,
  EventType,
  type BaseEvent,
  type Message,
} from "@ag-ui/client";

export type AgentStatus =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "writing" }
  | { kind: "tool_calling"; toolName: string };

export interface UseCodingAgentArgs {
  project: string;
  sessionId: string;
  modelId: string;
}

export interface UseCodingAgentResult {
  messages: Message[];
  isRunning: boolean;
  sendMessage: (content: string) => Promise<void>;
  status: AgentStatus;
  error: string | null;
}

export function statusFromEvent(event: BaseEvent, current: AgentStatus): AgentStatus {
  switch (event.type) {
    case EventType.REASONING_START:
    case EventType.REASONING_MESSAGE_START:
      return { kind: "thinking" };
    case EventType.TEXT_MESSAGE_START:
    case EventType.TEXT_MESSAGE_CONTENT:
      return { kind: "writing" };
    case EventType.TOOL_CALL_START: {
      const name = (event as { toolCallName?: string }).toolCallName ?? "tool";
      return { kind: "tool_calling", toolName: name };
    }
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
}: UseCodingAgentArgs): UseCodingAgentResult {
  const agent = useMemo(
    () => new HttpAgent({ url: "/api/agent/code", threadId: sessionId }),
    [sessionId],
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<AgentStatus>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef<string | null>(null);

  // Load existing messages on mount and seed the agent's internal buffer.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/agent/code/${encodeURIComponent(project)}/sessions/${encodeURIComponent(sessionId)}/messages`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages?: Array<{ role: string; content: string }>;
        };
        if (cancelled) return;
        const loaded: Message[] = (data.messages ?? []).map((m, i) => ({
          id: `loaded-${i}`,
          role: m.role as Message["role"],
          content: m.content,
        })) as Message[];
        setMessages(loaded);
        /* eslint-disable @typescript-eslint/no-explicit-any */
        agent.addMessages(
          loaded.map((m) => ({ id: m.id, role: m.role, content: m.content })) as any,
        );
        /* eslint-enable @typescript-eslint/no-explicit-any */
      } catch {
        // non-fatal; user can start fresh
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project, sessionId, agent]);

  // Subscribe to the agent so we mirror its messages[] into local state.
  useEffect(() => {
    return agent.subscribe({
      onRunStartedEvent: () => {
        setIsRunning(true);
        setError(null);
      },
      onEvent: ({ event }) => {
        setStatus((s) => statusFromEvent(event, s));
      },
      onRunFinishedEvent: () => {
        setIsRunning(false);
        setStatus({ kind: "idle" });
      },
      onRunFinalized: () => {
        setMessages([...agent.messages]);
      },
      onRunFailed: ({ error: err }) => {
        setIsRunning(false);
        setStatus({ kind: "idle" });
        setError(err instanceof Error ? err.message : String(err));
        setMessages([...agent.messages]);
      },
      onMessagesChanged: () => {
        setMessages([...agent.messages]);
      },
    });
  }, [agent]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!modelId) {
        setError("No model selected");
        return;
      }
      const runId = crypto.randomUUID();
      runIdRef.current = runId;
      setError(null);
      setIsRunning(true);
      setStatus({ kind: "thinking" });
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content });
      setMessages([...agent.messages]);

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
              setIsRunning(false);
              setStatus({ kind: "idle" });
              setError(err instanceof Error ? err.message : String(err));
            },
            onRunFinalized: () => {
              setIsRunning(false);
              setStatus({ kind: "idle" });
            },
          },
        );
      } catch (err) {
        setIsRunning(false);
        setStatus({ kind: "idle" });
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [agent, project, sessionId, modelId],
  );

  return { messages, isRunning, sendMessage, status, error };
}
```

### Step 2.4: Run hook tests to confirm they pass

Run: `cd /home/javier/projects/ai-chatbot/packages/chatbot && npx vitest run tests/unit/agent-code/use-coding-agent.test.ts`

Expected: PASS — all five `statusFromEvent` tests pass.

### Step 2.5: Update the agent-conversation component prop shape

The `AgentConversation` component currently receives `messages`, `isRunning`, `streamingContent`, `status`, `steps`. The new shape receives `messages`, `isRunning`, `status`, `error`. The component will render `messages` directly (one entry per AG-UI message, including tool results) and show a small live indicator at the bottom while `isRunning` is true and the last `status` is not `idle`.

### Step 2.6: Commit the hook and tests

```bash
cd /home/javier/projects/ai-chatbot
git add packages/chatbot/lib/features/agent-code/hooks/use-coding-agent.ts \
        packages/chatbot/tests/unit/agent-code/use-coding-agent.test.ts
git commit -m "feat(agent-code): let HttpAgent own messages[] in useCodingAgent

The hook now delegates state accumulation to @ag-ui/client's HttpAgent
and mirrors its messages[] into local React state. This eliminates the
custom steps[] + streamingContent model that was duplicating text when
the assistant produced multiple messages across tool-call turns."
```

---

## Task 3: Update `AgentMessage` to render reasoning, text, and tool results

**Files:**
- Modify: `packages/chatbot/components/agent-code/agent-message.tsx`

The component now receives an AG-UI `Message` object (with `role`, `content`, `toolCalls`). For `role: "reasoning"` it renders a collapsible Reasoning block. For `role: "assistant"` it renders the markdown content via `Response` plus, if `toolCalls` exist, a small inline list of tool call names. For `role: "tool"` it renders the tool result in a small monospace block. For `role: "user"` it keeps the current chat-bubble look.

### Step 3.1: Write the new component

Replace the contents of `packages/chatbot/components/agent-code/agent-message.tsx` with:

```tsx
"use client";

import { memo } from "react";
import { Streamdown } from "streamdown";
import { ChevronDownIcon } from "lucide-react";
import type { Message, ToolCall } from "@ag-ui/client";
import { Response } from "@/components/chat/response";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils/helpers";

export interface AgentMessageProps {
  message: Message;
}

function toolCallLabel(tc: ToolCall): string {
  const name = tc.function?.name ?? tc.type ?? "tool";
  return name;
}

function ToolCallBadge: React.FC<{ tc: ToolCall }> = ({ tc }) => (
  <div className="my-2 text-sm text-muted-foreground">
    <span className="font-mono bg-secondary px-2 py-1 rounded">
      {toolCallLabel(tc)}
    </span>
  </div>
);

function ToolResultBlock: React.FC<{ content: string }> = ({ content }) => (
  <details className="my-2 text-xs">
    <summary className="cursor-pointer text-muted-foreground select-none">
      Tool result
    </summary>
    <pre className="mt-2 p-2 bg-secondary rounded overflow-x-auto whitespace-pre-wrap">
      {content}
    </pre>
  </details>
);

function ReasoningBlock: React.FC<{ content: string }> = ({ content }) => (
  <Collapsible className="mb-4 not-prose" defaultOpen={false}>
    <CollapsibleTrigger className="flex w-full items-center space-x-2 text-muted-foreground text-sm cursor-pointer user-select-none">
      <span className="font-semibold">Reasoning</span>
      <ChevronDownIcon className="size-4 transition-transform [[data-state=open]_&]:rotate-180" />
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-2 text-sm text-muted-foreground">
      <Streamdown>{content}</Streamdown>
    </CollapsibleContent>
  </Collapsible>
);

export const AgentMessage: React.FC<AgentMessageProps> = memo(({ message }) => {
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

  // assistant
  const text = typeof message.content === "string" ? message.content : "";
  return (
    <div className="mb-8 pt-4">
      <div className="flex flex-col w-full space-y-2">
        {message.toolCalls?.map((tc) => (
          <ToolCallBadge key={tc.id} tc={tc} />
        ))}
        {text && (
          <div className={cn("max-w-full")}>
            <Response>{text}</Response>
          </div>
        )}
      </div>
    </div>
  );
});

AgentMessage.displayName = "AgentMessage";
```

### Step 3.2: Verify it compiles

Run: `cd /home/javier/projects/ai-chatbot/packages/chatbot && npm run type:check`

Expected: PASS. (If `Collapsible` is not exported from `components/ui/collapsible`, check existing imports in `reasoning.tsx` for the right path and adjust.)

### Step 3.3: Commit

```bash
cd /home/javier/projects/ai-chatbot
git add packages/chatbot/components/agent-code/agent-message.tsx
git commit -m "feat(agent-code): render reasoning, tool calls, and tool results in AgentMessage"
```

---

## Task 4: Rewrite `AgentConversation` to render the `messages[]` array

**Files:**
- Modify: `packages/chatbot/components/agent-code/agent-conversation.tsx`
- Modify: `packages/chatbot/components/agent-code/agent-code-chat.tsx`

The component now takes `messages: Message[]`, `isRunning`, `status: AgentStatus`, and renders one `AgentMessage` per message. While `isRunning` is true, a small footer shows the current `status` label (e.g. "Reasoning...", "Calling: bash..."). The auto-scroll behavior is preserved.

### Step 4.1: Rewrite the conversation component

Replace the contents of `packages/chatbot/components/agent-code/agent-conversation.tsx` with:

```tsx
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { Message } from "@ag-ui/client";
import { AgentMessage } from "./agent-message";
import { ChatNavigation } from "@/components/chat/navigation";
import type { AgentStatus } from "@/lib/features/agent-code/hooks/use-coding-agent";
import { DotsLoadingIcon } from "@/components/ui/icons";

const SCROLL_NEAR_BOTTOM_THRESHOLD = 100;

function isNearBottom(container: HTMLElement) {
  return (
    container.scrollTop + container.clientHeight >=
    container.scrollHeight - SCROLL_NEAR_BOTTOM_THRESHOLD
  );
}

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
  }
}

export interface AgentConversationProps {
  messages: Message[];
  isRunning: boolean;
  status: AgentStatus;
}

export const AgentConversation: React.FC<AgentConversationProps> = ({
  messages,
  isRunning,
  status,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledAway = useRef(false);
  const rafId = useRef(0);
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const checkVisibility = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    setShowTop(container.scrollTop > 100);
    setShowBottom(!isNearBottom(container));
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    userScrolledAway.current = !isNearBottom(container);
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(() => {
        rafId.current = 0;
        checkVisibility();
      });
    }
  }, [checkVisibility]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleScroll);
    checkVisibility();
    return () => {
      container.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(rafId.current);
    };
  }, [handleScroll, checkVisibility]);

  useEffect(() => {
    checkVisibility();
  }, [messages, checkVisibility]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!userScrolledAway.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length]);

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToBottom = () => {
    scrollContainerRef.current?.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  const label = statusLabel(status);

  return (
    <div className="w-full relative overflow-y-hidden flex-1">
      <div
        className="w-full h-full overflow-y-auto"
        ref={scrollContainerRef}
      >
        {messages.length === 0 && !isRunning && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Ask the coding agent a question to get started.
          </div>
        )}
        <div className="max-w-5xl mx-auto px-8 pb-15">
          {messages.map((msg) => (
            <AgentMessage key={msg.id} message={msg} />
          ))}
          {isRunning && label && (
            <div
              data-testid="agent-status"
              className="flex items-center gap-2 text-muted-foreground text-sm py-3"
            >
              <DotsLoadingIcon />
              <span>{label}</span>
            </div>
          )}
        </div>
      </div>
      <ChatNavigation
        showPrev={false}
        showNext={false}
        showBottom={showBottom}
        showTop={showTop}
        scrollToPrev={() => {}}
        scrollToNext={() => {}}
        scrollToBottom={scrollToBottom}
        scrollToTop={scrollToTop}
        className="bottom-4"
      />
    </div>
  );
};
```

### Step 4.2: Update the parent chat component to pass the new props

In `packages/chatbot/components/agent-code/agent-code-chat.tsx`, replace the call to `useCodingAgent` and the `AgentConversation` prop bag.

Replace the destructuring at line 22-26:

```ts
const { messages, isRunning, sendMessage, streamingContent, status, steps } = useCodingAgent({
  project,
  sessionId,
  modelId,
});
```

with:

```ts
const { messages, isRunning, sendMessage, status } = useCodingAgent({
  project,
  sessionId,
  modelId,
});
```

Replace the `<AgentConversation ... />` line at line 42:

```tsx
<AgentConversation messages={messages} isRunning={isRunning} streamingContent={streamingContent} status={status} steps={steps} />
```

with:

```tsx
<AgentConversation messages={messages} isRunning={isRunning} status={status} />
```

### Step 4.3: Verify it compiles

Run: `cd /home/javier/projects/ai-chatbot/packages/chatbot && npm run type:check`

Expected: PASS.

### Step 4.4: Run lint

Run: `cd /home/javier/projects/ai-chatbot/packages/chatbot && npm run lint`

Expected: PASS (or only pre-existing warnings unrelated to this change).

### Step 4.5: Commit

```bash
cd /home/javier/projects/ai-chatbot
git add packages/chatbot/components/agent-code/agent-conversation.tsx \
        packages/chatbot/components/agent-code/agent-code-chat.tsx
git commit -m "feat(agent-code): render messages[] in AgentConversation

The conversation now renders the messages array produced by the AG-UI
HttpAgent. While the run is in progress, a single status indicator
shows the current phase (Reasoning / Writing / Calling tool). This
removes the duplicated-text bug and ensures paragraph breaks in the
model output are preserved."
```

---

## Task 5: End-to-end smoke test with the worker stub

**Files:**
- Modify: `packages/chatbot/app/(chat)/api/agent/code/worker-stub/rpc/route.ts` (optional: add a multi-turn stub event sequence to test that bug is fixed)
- Test: `packages/chatbot/tests/e2e/agent-code/agent-code.spec.ts` (existing — should keep passing)

The e2e test sends "Hello agent" and expects "Hello from stub" to appear. After the refactor:
- The stub emits `agent_start` → `message_start` → `message_update.text_delta` "Hello from stub" → `message_end` → `agent_end`.
- The translator converts to `RUN_STARTED` → `TEXT_MESSAGE_START` → `TEXT_MESSAGE_CONTENT` → `TEXT_MESSAGE_END` → `RUN_FINISHED`.
- `HttpAgent` accumulates a single assistant message with content "Hello from stub".
- The conversation renders it.

The existing test should still pass. No changes needed unless the test fails.

### Step 5.1: Run the e2e test

Run: `cd /home/javier/projects/ai-chatbot/packages/chatbot && npm run test:e2e -- --grep "Coding Agent"`

Expected: PASS. If the test selector is flaky, increase timeout to 15000ms.

### Step 5.2: Manual smoke test

In dev (`pnpm dev` from repo root, then open `http://localhost:3000/agent/code`):
1. Pick a project, click "+ New session".
2. Send: "List the files in the current directory".
3. Watch the stream:
   - "Reasoning..." appears.
   - A small "Calling: bash..." line appears.
   - A tool result block appears.
   - The final assistant text is shown, with paragraph breaks preserved.
4. After completion, refresh the page. The full message should reload with correct formatting and no duplication.

### Step 5.3: Commit any test tweaks

```bash
cd /home/javier/projects/ai-chatbot
git add packages/chatbot/tests/e2e/agent-code/agent-code.spec.ts \
        packages/chatbot/app/\(chat\)/api/agent/code/worker-stub/rpc/route.ts
git commit -m "test(agent-code): verify e2e still passes with new AG-UI translator"
```

---

## Self-Review

**Spec coverage:**
- Bug 1 (duplicated text during streaming) → fixed by Task 2 (HttpAgent owns messages, no per-step AgentMessage render) + Task 1 (translator emits proper TEXT_MESSAGE_END so each assistant message is a separate AG-UI message).
- Bug 2 (status indicators disappear) → fixed by Task 4 (single status indicator at bottom derived from latest event, not a per-step array).
- Bug 3 (line breaks collapsed) → fixed by Task 2 (content stays in its own message; streamdown renders `\n\n` correctly) + Task 1 (translator no longer concatenates deltas across message boundaries).
- Translator produces full AG-UI protocol → Task 1.
- Client uses natural messages[] model → Task 2.
- Conversation renders messages[] → Tasks 3 + 4.
- Tests cover the new behavior → Tasks 1.1, 2.1, 5.1.

**Placeholder scan:** No "TODO" or "fill in details" — every step has the actual code, file path, and command.

**Type consistency:**
- `AgentStatus` is exported from `use-coding-agent.ts` (Task 2) and imported in `agent-conversation.tsx` (Task 4) with the same shape.
- `Message` is imported from `@ag-ui/client` in both `use-coding-agent.ts` (Task 2) and `agent-message.tsx` (Task 3).
- `PiToAguiTranslator` is exported as a class (Task 1) and instantiated in the route (Task 1.5).
- The new `AgentMessage` accepts `message: Message` (Task 3) and is called with `<AgentMessage key={msg.id} message={msg} />` (Task 4) — consistent.
- `ToolCall` is imported from `@ag-ui/client` in `agent-message.tsx` and used in `ToolCallBadge` — consistent.

**Architecture alignment:**
- Single responsibility: translator only knows Pi→AG-UI; hook only knows HttpAgent state; components only render. ✓
- Files change together: translator + route (Task 1), hook + tests (Task 2), message + conversation + chat (Tasks 3+4). ✓
- Established patterns: reuses `Response`, `Collapsible`, `ChatNavigation`, `DotsLoadingIcon`, `Streamdown`. ✓
- No new dependencies introduced — only uses what's already in `package.json`. ✓
