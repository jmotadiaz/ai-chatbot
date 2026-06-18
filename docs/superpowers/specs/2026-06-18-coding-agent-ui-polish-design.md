# Coding Agent UI Polish — Session cards + Tool call collapse

**Date:** 2026-06-18
**Status:** Approved (pending implementation)
**Scope:** Two visual changes in the Coding Agent view, plus a small refactor to reuse an existing card style.

## Motivation

The Coding Agent view (`packages/chatbot/app/(chat)/agent/...`) currently has two visual issues:

1. **Session cards** use a bright/light fill that breaks the visual consistency of the app. The rest of the app's list rows (RAG resources, etc.) use a `bg-secondary rounded-lg` card. Restyling the Coding Agent session cards to match improves visual consistency.
2. **Tool call cards** render "Args" and "Output" as two separate native `<details>` collapsibles, which makes the UI noisy and makes a single tool call look like two distinct cards. The duration text (`0ms`) shown in the header is low-value. Combining Args + Output into a single collapsible with an internal divider and dropping the duration is cleaner and matches user expectations.

## Goals

- Visual consistency between Coding Agent session cards and the RAG resource list.
- A single, clean collapsible per tool call (no nested collapsibles).
- Minimal code change — only edit styling and the tool-call group JSX. No data model changes.

## Non-Goals

- Inline text highlights / source mapping inside assistant prose (out of scope; no current implementation in the codebase).
- Animations, transitions, or new icons.
- Changes to the RAG resource list itself.
- New shared card primitive component (kept simple to avoid scope creep — see "Implementation" below).

---

## Change 1: Coding Agent session cards

**Affected files:** the session-card component(s) under `packages/chatbot/components/agent-code/` and any caller that styles the card directly. (Identify the exact file during implementation — likely `agent-conversation.tsx` or a `session-card.tsx` child.)

**Current state (from screenshots):** session cards use a bright/light background and a bright title color, which contrasts strongly with the muted `bg-secondary` rows used elsewhere.

**New state:** match the `RagResourceItem` (`packages/chatbot/components/rag/resource-item.tsx:16-50`) visual style:

- Container: `bg-secondary rounded-lg` with the same padding.
- Title: default color (foreground), `font-semibold`, `truncate`. The session id and date are kept as separate text lines (same as today).
- Hover: title gets `hover:underline` (link-style). No other hover effect, no "active/selected" ring — the navigation/router handles the active state.
- No card-level border, no bright/light fill.

**Component reuse decision:** the session card is **not** extracted into a shared primitive with `RagResourceItem` in this change. The two are not identical (the resource list has a Trash button and a clickable link; the session card opens a session and shows a date). Sharing would require prop variation and is not worth the abstraction at this scale. The two components will look the same but remain independent, following the project's existing "Headless Component Pattern" of small, focused components.

---

## Change 2: Tool call card — single collapse, divider, no duration

**Affected file:** `packages/chatbot/components/agent-code/tool-call-group.tsx` (single file).

### Current state

A `ToolCallGroup` renders as a card with:

- A header row: icon + display name + summary + status icon (and `fmtDuration(startedAt, finishedAt)` text if `finishedAt` is set).
- A native `<details>` block for "Args" containing a `<pre>` with the args.
- A second native `<details>` block for "Output" containing a `<pre>` with the result (clamped to 20 lines, with a "Show more" button).
- The two `<details>` blocks are visually separated by a `border-t border-border`.

### New state

The entire card becomes **one** collapsible. The header is the clickable toggle. The body, when open, contains both Args and Output separated by a full-width hairline.

Structure:

```
┌─ card (border border-border rounded-md bg-card) ─────────────┐
│  <summary> header row (clickable toggle) </summary>          │
│    icon · displayName · summary (flex-1) · status · chevron  │
│                                                              │
│  <div body>                                                  │
│    <div>Args label + <pre>args</pre></div>                   │
│  ───────────────── border-t border-border ─────────────────  │
│    <div>Output label + <pre>result</pre></div>              │
│    [Show more button, only if clamped]                       │
│  </div>                                                      │
└──────────────────────────────────────────────────────────────┘
```

### Header row details

- Layout: `flex items-center gap-2 px-3 py-2 text-sm`.
- Order, left to right: tool icon, display name, summary (with `flex-1 truncate`), status icon, chevron.
- **Chevron placement:** at the far right of the header. Wrapped in a fixed-size box (`size-4 inline-flex items-center justify-center`) so it stays vertically centered regardless of row height.
- **Chevron rotation:** rotates 180° on `[open]` (when the `<details>` is expanded) using `transition-transform` and a `group-open:` or `[&[open]]:` selector. If the visual companion or test feedback shows the rotation is undesirable, omit the rotation and keep a static chevron.
- **Duration removed:** the `fmtDuration(startedAt, finishedAt)` text and the surrounding `<span>` are removed entirely from the header. The `fmtDuration` helper is kept in the file (not deleted) in case it is referenced elsewhere; verify before removal.
- **Status icon:** unchanged (Loader2 for running, Check green for ok, X red for error).

### Body details

- The body is a single `<div>` that becomes visible when the parent `<details>` is open. (Native `<details>`/`<summary>` already handles the open/close state without extra React state — keep the same pattern the file uses today, do not add a `useState` for the open flag unless required for the "Show more" interaction.)
- Args section: label "Args" (small, muted, uppercase or as today) + `<pre className="px-3 py-2 text-xs bg-secondary overflow-x-auto whitespace-pre-wrap">{group.args}</pre>`.
- Divider: a single `<div className="border-t border-border" />` spanning the full width of the card (same as today's separator between the two old collapsibles).
- Output section: same `<pre>` styling, with the error-state red background (`bg-red-50 dark:bg-red-950/30`) when `group.status === "error"`, otherwise `bg-secondary`. The 20-line clamp and "Show more" button are preserved exactly as they are today (the existing `useState` for `expanded` stays).
- Default state: **closed.** A `<details>` element is closed by default unless `open` is set — do not set `open` on the new wrapper.

### Things that stay unchanged

- `React.memo` wrapper.
- The `data-testid="tool-call-group"`, `data-tool`, `data-status` attributes.
- The `ToolCallGroup` and `ToolCallStatus` types in `lib/features/agent-code/types.ts`.
- The 20-line output clamp and "Show more" behavior.
- The icon / display-name maps at the top of the file.
- `group.status` rendering rules (running/ok/error).
- The `data-testid="status-ok"` and `data-testid="status-error"` on the status icons.

---

## Data flow

No data model changes. `ToolCallGroup` (`lib/features/agent-code/types.ts:8-17`) keeps the same fields: `id`, `name`, `args`, `argsParsed?`, `result?`, `status`, `startedAt`, `finishedAt?`, `summary`. The component consumes the same shape; only the JSX layout changes.

## Error handling

No change. The "Output" block's red background on `status === "error"` is preserved.

## Testing

- Run `pnpm test` to ensure no existing snapshot/Playwright tests break. The only DOM attributes that change are inside the card body (number of `<details>` elements goes from 2 to 1; the Args `<pre>` is now nested inside the card body, not in a separate `<details>`). Any test that asserts on a specific number of `<details>` per tool call group needs to be updated from 2 → 1.
- Visual check: open the Coding Agent view, trigger a `shell` tool call, confirm:
  - Header row: icon + name + summary + status + right-side chevron, all vertically centered.
  - Click anywhere on the header → card expands → Args + divider + Output visible together.
  - Output past 20 lines shows "Show more" button.
  - Duration text is gone.
- Session cards: hover the title → underlined. No bright fill on any state.

## Files to touch

- `packages/chatbot/components/agent-code/tool-call-group.tsx` — Change 2.
- One or more files under `packages/chatbot/components/agent-code/` and/or `packages/chatbot/app/(chat)/agent/` for Change 1 (identify the exact session card file during implementation).

## Risks

- Low. The changes are visual only, with no new dependencies, no new state, and no changes to data flow.
- One test update: tests that count `<details>` per `ToolCallGroup` need to expect 1, not 2.
