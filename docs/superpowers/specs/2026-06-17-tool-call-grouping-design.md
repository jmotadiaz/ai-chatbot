# Design: Coding Agent Tool Call Grouping

**Date:** 2026-06-17
**Status:** Draft (awaiting user review)

## Goal

Render tool calls from the coding agent as **one scannable group per call** (header with tool name + brief description + status, collapsable body with args and output) instead of the current flat list of detached tool badges and orphan result collapsibles. Use the AG-UI protocol's existing `toolCallId` correlation and the `StepStarted`/`StepFinished` lifecycle events to drive a small state machine in the frontend hook.

## Context (current bug)

Today the path is `Pi → PiToAguiTranslator → SSE → HttpAgent.messages → AgentMessage by message.id`. The renderer:

- Paints every `toolCalls[i]` of an `assistant` message as a flat `ToolCallBadge` (one per line, all at the same indentation).
- Materialises each `ToolCallResult` as a **separate** `Message` with `role: "tool"`, painted as an independent `<details>` "Tool result".

The `toolCallId` that links a tool call to its result is buried in the data; the UI ignores it. In a typical run with N tool calls the user sees N flat badges followed by N detached result collapsibles, with no visual relation between a badge and its result.

The AG-UI protocol already provides everything we need (`ToolCallStart/Args/End/Result` share `toolCallId`; `StepStarted`/`StepFinished` carry step boundaries). The fix is in the **shape of the data the UI consumes**, not the protocol.

## Approach (C + D)

- **C (hook-side derived view).** Keep `HttpAgent.messages: Message[]` unchanged. In `useCodingAgent` derive an `items: AgentItem[]` whose `assistant` entries carry pre-paired `ToolCallGroup[]` (args + result + status), and filter out orphan `tool` messages. A pure `groupItems(messages)` function backs the derivation and is unit-testable in isolation.
- **D (translator-side step events).** In `PiToAguiTranslator`, additionally emit `StepStarted({ stepName: "tool:<name>" })` on `tool_execution_start` and `StepFinished({ stepName: "tool:<name>" })` on `tool_execution_end`. The `toolCallId` travels in `rawEvent` of each step event so the hook can correlate. Step events do not replace `ToolCallStart/Args/End/Result`; they are emitted alongside.

Granularity: **one group per tool call** (not per turn). Parallel or sequential tool calls in the same assistant turn render as independent, ordered groups.

## Data Model

New file `lib/features/agent-code/types.ts`:

```ts
export type ToolCallStatus = "running" | "ok" | "error";

export interface ToolCallGroup {
  id: string;            // toolCallId
  name: string;          // "bash", "read", "edit", ...
  args: string;          // best-effort string for the code block (JSON.stringify or raw)
  argsParsed?: unknown;  // parsed JSON when valid; used by summarizeToolCall
  result?: string;       // from ToolCallResult; undefined while "running"
  status: ToolCallStatus;
  startedAt: number;
  finishedAt?: number;
  summary: string;       // precomputed one-liner for the header
}

export type AgentItem =
  | { kind: "user"; message: Message }
  | { kind: "reasoning"; message: Message }
  | { kind: "assistant"; message: Message; toolGroups: ToolCallGroup[] };
// tool messages are not surfaced as items; their payloads are merged into
// the preceding assistant's toolGroups by toolCallId. Orphan tool messages
// (no preceding assistant with a matching id) are dropped and logged.
```

`Message` (the AG-UI type) remains the **only** source of truth on the wire and in `HttpAgent`. `AgentItem` is a pure projection for the UI.

## Hook Changes: `useCodingAgent`

- Export a new pure function `groupItems(messages: Message[], toolErrors?: ReadonlyMap<string, true>): AgentItem[]` from `lib/features/agent-code/group-items.ts`. The optional `toolErrors` map is keyed by `toolCallId` and is used to mark groups as `"error"` (the `tool` role message itself does not carry an error signal in AG-UI; the error comes from `StepFinished.rawEvent.isError`).
- The hook exposes `items: AgentItem[]` (computed via `useMemo` from `agent.messages` and the hook-local `toolErrors` map).
- The hook also tracks `toolErrors: Map<string, true>` as part of its reducer state, populated by the `onEvent` subscription when a `StepFinished` event arrives with `rawEvent.isError === true` and `rawEvent.toolCallId` set. `toolErrors` is cleared on `RUN_STARTED`.
- Reducer behavior is otherwise unchanged: it still owns `isRunning`, `status`, `error` and updates from the `HttpAgent` subscription.
- `useSyncExternalStore` keeps `messages` as the canonical snapshot; `items` and `toolErrors` are derived. One new event source is added to the `HttpAgent` subscription (`StepStarted`/`StepFinished`) — used solely to populate the `toolErrors` map and the `status` state machine. No `Message[]` mutation.
- `AgentStatus` extends with one new variant and one new field — see Status Machine below.

### `groupItems` algorithm

1. Walk `messages` in order. Maintain `currentAssistant: AgentItem["assistant"] | null`.
2. On `assistant` message: emit the previous `currentAssistant` (if any), start a new `currentAssistant` with `toolGroups` keyed by `toolCalls[i].id`. Each `ToolCallGroup` is seeded with `name`, `args = JSON.stringify(toolCalls[i].function?.arguments ?? toolCalls[i].args ?? "")`, `argsParsed` if JSON-parseable, `status: "running"`, `startedAt = now()`, `summary = summarizeToolCall(name, argsParsed ?? args)`.
3. On `tool` message: find the open `ToolCallGroup` whose `id === message.toolCallId` inside `currentAssistant`. If found, set `result = stringContent(message.content)`, `status = toolErrors?.has(id) ? "error" : "ok"`, `finishedAt = now()`. If not found, log `groupItems.orphan_tool` and drop.
4. On `user` / `reasoning` message: emit the previous `currentAssistant` and start a new item.
5. At end, emit the trailing `currentAssistant`.
6. Order of `toolGroups` follows the order of `toolCalls` on the assistant message (stable).
7. Pure, no side effects beyond the optional `console.debug` for orphans (gated by a logger).

## Translator Changes: `PiToAguiTranslator`

Additive. Existing emissions stay identical.

- On `tool_execution_start` (`toolCallId`, `toolName`): before the existing handling, push a `StepStarted` event with `stepName: \`tool:${toolName}\`` and `rawEvent: { toolCallId }`.
- On `tool_execution_end` (`toolCallId`, `toolName`, `result`, `isError`): after the existing `ToolCallResult` emission, push a `StepFinished` event with `stepName: \`tool:${toolName}\``, `rawEvent: { toolCallId, isError }`.
- The `StepStarted`/`Finished` payloads do not carry the args/result themselves; correlation happens in the hook by `toolCallId` (already in `rawEvent`).

## Component Changes

### New `ToolCallGroup` (`components/agent-code/tool-call-group.tsx`)

Single tool call unit. Layout:

```
┌──────────────────────────────────────────────────────────────┐
│  ⌨  Shell   find step events in AG-UI proto        ⌄  0.4s │  ← header (always visible)
├──────────────────────────────────────────────────────────────┤
│  $ find /Users/.../node_modules/.pnpm/@ag-ui+proto* ...     │  ← args block
│                                                              │
│  /Users/.../dist/index.d.ts                                  │  ← output (result) block
│  ---                                                         │
└──────────────────────────────────────────────────────────────┘
```

**Header (always one line):**
- Tool icon (lucide, see `TOOL_ICONS` map below).
- Tool display name (e.g. `Shell`, `Read`, `Edit`, `Write`, `Grep`, `Find`, `Ls`).
- Brief one-liner (`group.summary`), truncated visually if too long.
- Right side: status badge (spinner for `running`, check for `ok`, `x` for `error`) and `mm:ss` duration when `finishedAt` is set.

**Body (collapsible, collapsed by default):**
- `<details>` with `<summary>` "Args" and a code block (monospace, `bg-secondary`, `rounded`, language hint when applicable: `bash`, `json`, `text`).
- `<details>` with `<summary>` "Output" and a `<pre>` for `result`. If the output exceeds 20 lines, clamp with a "Show more" toggle.
- Use `Response` (Streamdown) for args/result only when the content is known to be markdown (rare; default is raw `<pre>`).

**States:**
- `running` → spinner next to the tool name.
- `ok` → green check.
- `error` → red `x`. Result block, if present, gets a subtle error border.

### `TOOL_ICONS` and `TOOL_DISPLAY_NAMES`

```ts
// components/agent-code/tool-call-group.tsx
const TOOL_ICONS: Record<string, LucideIcon> = {
  bash: Terminal, shell: Terminal,
  read: FileText,
  write: FilePlus,
  edit: Pencil,
  grep: Search,
  find: FolderOpen,
  ls: FolderOpen,
};

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  bash: "Shell", shell: "Shell",
  read: "Read",
  write: "Write",
  edit: "Edit",
  grep: "Grep",
  find: "Find",
  ls: "Ls",
};
```

Unknown tools fall back to `Wrench` icon and a title-cased version of the name.

### Revised `AgentMessage` (`components/agent-code/agent-message.tsx`)

- Case `assistant`: render `toolGroups.map(g => <ToolCallGroup ... />)` above the text body, then `text` via `Response`.
- Case `tool`: not rendered as a top-level item (handled in `AgentConversation` by filtering); if a stray `tool` message is encountered (e.g. loaded history without grouping metadata), render a small `<details data-orphan="true">` block as a safety net.
- Case `user` / `reasoning`: unchanged.

### Revised `AgentConversation` (`components/agent-code/agent-conversation.tsx`)

- Consume `items: AgentItem[]` from the hook instead of `messages: Message[]`.
- `AgentMessage` is called with `item.kind === "assistant" ? { toolGroups, text } : { ... }`.
- Status bar label mapping extended for the new `step_running` kind (see Status Machine).

## Tool Summary Function

New pure function `lib/features/agent-code/tool-summary.ts`:

```ts
export function summarizeToolCall(name: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  switch (name.toLowerCase()) {
    case "bash":
    case "shell":
      return truncate(String(a?.command ?? a?.cmd ?? ""), 80);
    case "read":
      return String(a?.path ?? a?.filePath ?? "");
    case "write":
      return String(a?.path ?? "");
    case "edit":
      return String(a?.path ?? "");
    case "grep":
      return [a?.pattern, a?.path ? `in ${shortPath(String(a.path))}` : ""]
        .filter(Boolean)
        .join(" ");
    case "find":
      return String(a?.pattern ?? a?.path ?? "");
    case "ls":
      return String(a?.path ?? "");
    default:
      return truncate(safeStringify(a), 80);
  }
}
```

`shortPath` collapses the cwd prefix to `~/`; `truncate` appends `…` past the limit; `safeStringify` is `JSON.stringify` with a `try/catch` fallback to `String(args)`. Pure, no I/O. Unit-testable.

## Status Machine

```ts
// lib/features/agent-code/hooks/use-coding-agent.ts
export type AgentStatus =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "writing" }
  | { kind: "tool_calling"; toolName: string; toolCallId?: string }  // toolCallId added (optional)
  | { kind: "step_running"; stepName: string };                     // new
```

- `StepStarted` → `{ kind: "step_running", stepName }`.
- `StepFinished` → `{ kind: "thinking" }` (mirrors the current behavior of `ToolCallEnd`).
- `ToolCallStart` / `ToolCallEnd` keep their current semantics.
- `statusLabel` (in `agent-conversation.tsx`) gains a case for `step_running` → "Running: \`<stepName>\`".
- The `tool_calling.toolCallId` field is new but optional. The existing `statusLabel` for `tool_calling` keeps its current `Calling: <name>` text and ignores the new field.

## Files

| Action | File | Purpose |
|---|---|---|
| NEW | `lib/features/agent-code/types.ts` | `ToolCallGroup`, `AgentItem` |
| NEW | `lib/features/agent-code/group-items.ts` | Pure `groupItems(messages, toolErrors?)` function |
| NEW | `lib/features/agent-code/tool-summary.ts` | Pure `summarizeToolCall(name, args)` |
| NEW | `components/agent-code/tool-call-group.tsx` | New `ToolCallGroup` component, `TOOL_ICONS`, `TOOL_DISPLAY_NAMES` |
| MODIFY | `lib/features/agent-code/hooks/use-coding-agent.ts` | Expose `items`; maintain `toolErrors` map; extend `AgentStatus` (`step_running`, `tool_calling.toolCallId`); handle `StepStarted`/`Finished` in `statusFromEvent` and `toolErrors` reducer |
| MODIFY | `components/agent-code/agent-message.tsx` | Render `toolGroups` for assistant; orphan fallback for stray `tool` |
| MODIFY | `components/agent-code/agent-conversation.tsx` | Consume `items`; add `step_running` to `statusLabel` |
| MODIFY | `lib/features/agent-code/pi-to-agui-translator.ts` | Emit `StepStarted`/`StepFinished` around `tool_execution_*` |
| NEW | `tests/unit/agent-code/group-items.test.ts` | Pure unit tests for `groupItems` |
| NEW | `tests/unit/agent-code/tool-summary.test.ts` | Pure unit tests for `summarizeToolCall` |
| MODIFY | `tests/unit/agent-code/use-coding-agent.test.ts` | Add cases for `items` derivation, `toolErrors`, and `step_running` |
| MODIFY | `tests/unit/agent-code/pi-to-agui-translator.test.ts` | Assert `StepStarted`/`Finished` emissions |
| NEW | `tests/e2e/agent-code/tool-call-grouping.spec.ts` | E2E: run with ≥2 tool calls; assert one Tool calls section with sub-blocks |
| NEW | `tests/unit/agent-code/__snapshots__/tool-call-group.test.tsx.snap` | Visual snapshot of `ToolCallGroup` |

## Testing

- **Unit (pure):**
  - `groupItems.test.ts`:
    - assistant with N tool calls → N groups, args from `toolCalls[i].function.arguments` (or `args`).
    - `tool` message with matching `toolCallId` is merged into the right group with `result` and `status: "ok"`.
    - `tool` message with matching `toolCallId` AND `toolErrors` map containing that id → `status: "error"`.
    - `tool` message without a matching open group → orphan, dropped, debug log.
    - Order of `toolGroups` follows `toolCalls` order regardless of result arrival order.
    - `user`/`reasoning` flush the previous assistant and start fresh.
    - Empty input → empty output.
  - `tool-summary.test.ts`: one assertion per tool mapping; truncation behavior; unknown tool fallback.
  - `use-coding-agent.test.ts`: `items` matches `groupItems(agent.messages)`; `statusFromEvent(StepStarted)` returns `step_running`; `StepFinished` returns `thinking`; `ToolCallStart` carries `toolCallId`.
  - `pi-to-agui-translator.test.ts`: `tool_execution_start` produces a `StepStarted` with `stepName: "tool:<name>"` and the existing `ToolCallStart`; `tool_execution_end` produces a `StepFinished` after the existing `ToolCallResult`.
- **Component (snapshot):**
  - `ToolCallGroup` snapshots: `running` (with spinner), `ok` (with check + duration), `error` (with x), long output (clamped), unknown tool (fallback icon).
- **E2E (Playwright):**
  - `tool-call-grouping.spec.ts`:
    1. Open an agent session, send a message that triggers ≥2 tool calls (e.g. "list the contents of X and Y").
    2. Wait for `RUN_FINISHED`.
    3. Assert there is exactly one `Tool calls` section per assistant turn and that it contains N sub-blocks (no detached `Tool result` blocks at top level).
    4. Assert each sub-block header shows the tool name and a non-empty summary.
    5. Assert clicking a sub-block expands and shows args + result.

## Compatibility / Migration

- `messages: Message[]` returned by `useCodingAgent` is unchanged. `items` is additive.
- `AgentStatus` is additive: `tool_calling` gains an optional `toolCallId`; `step_running` is new. `statusLabel` adds an exhaustive case.
- `PiToAguiTranslator` only adds events; no existing event is renamed or removed. Downstream consumers that only listen for `ToolCall*` events are unaffected.
- No new CSS, no new dependencies. All icons come from `lucide-react` (already in use). All collapsible primitives come from `@/components/ui/collapsible` (already in use).
- No change to the wire format, the route, the worker, or the persistence layer.

## Out of Scope

- Changing the AG-UI wire format or rolling a custom event type.
- Persisting `ToolCallGroup` shape to the database (we keep `Message` as the storage shape).
- Auto-approval, parallel tool execution, or any new tool set.
- Theming/visual polish beyond what the existing tokens already provide.
