# Tool Call Redesign — Codex Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar las tool calls del coding agent de pill a ancho completo a filas compactas estilo Codex (icono + texto apagado, shimmer en running, rojo en error, detalle expandible con borde izquierdo y contenedores Parameters/Result con syntax highlight).

**Architecture:** Extraer dos unidades nuevas (`HighlightedCode` para render shiki async y `ToolCallDetail` para el contenedor con borde izquierdo) y reescribir `ToolCallGroup` como fila compacta `button` con shimmer/error. El detalle solo monta al abrir, tokenizando solo el contenido visible (clamp 20 líneas). `Shimmer` se generaliza mínimamente a `ReactNode`.

**Tech Stack:** Next.js 16 / React 19, Tailwind CSS, shiki 3.21 (`tokenize` existente en `lib/features/code/file-browser/highlight.ts`), `next-themes`, `motion/react` (Shimmer), Vitest + Testing Library (jsdom).

## Global Constraints

- Node.js 24 + pnpm 11 (workspace). Scripts: `pnpm verify:fast` debe pasar antes de cada commit.
- No usar `process.env` en `src/`; usar `config` de `packages/config` (no aplica aquí, pero regla global).
- Mantener `ToolCallGroup` type intacto (`lib/features/code/types.ts`): `id, name, args, result?, status: "running"|"ok"|"error", summary`.
- Solo scope `packages/chatbot/components/code/*` + `components/ui/shimmer.tsx`; no tocar `components/chat/*` ni protocolo AG-UI.
- Borde izquierdo del detalle: exactamente `ml-2 pl-4 my-2 border-l-2 border-zinc-300 dark:border-zinc-600` (referencia `agent-code-section.tsx:182`).
- Labels del detalle: uppercase `PARAMETERS` / `RESULT`, `text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-1.5`.
- Contenedores del detalle: `rounded-lg border border-border bg-muted/20 overflow-hidden`.
- Fila: `w-fit max-w-full`, sin border/bg, icono `size-4`, summary `truncate max-w-48` con `title` tooltip, toda la fila clickeable, sin chevron, hover `hover:bg-muted/40 rounded-md -mx-1 px-1`.
- Estados fila: running → shimmer sobre texto, ok → `text-muted-foreground`, error → `text-red-600 dark:text-red-400` (icono y texto).
- Clamp result: 20 líneas lógicas antes de highlight, botón "Show more" (`block w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 border-t border-border`).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/chatbot/components/ui/shimmer.tsx` | Generalizar `Shimmer` a `ReactNode` (Task 1) |
| `packages/chatbot/components/code/highlighted-code.tsx` | **NEW** Renderizador shiki async: `tokenize(content, language, theme)` → spans con `style={{color}}`, fallback plaintext, cancelación stale (Task 2) |
| `packages/chatbot/components/code/tool-call-detail.tsx` | **NEW** Contenedor detalle con borde izquierdo + labels + `HighlightedCode` para args/result + clamp + `SubagentToolLink` (Task 3) |
| `packages/chatbot/components/code/tool-call-group.tsx` | Reescrito: fila compacta button + delegación a `ToolCallDetail` (Task 4) |
| `packages/chatbot/tests/component/agent-code/highlighted-code.test.tsx` | NEW tests HighlightedCode (Task 2) |
| `packages/chatbot/tests/component/agent-code/tool-call-detail.test.tsx` | NEW tests ToolCallDetail (Task 3) |
| `packages/chatbot/tests/component/agent-code/tool-call-group.test.tsx` | UPDATE migrar de `<details>` a `button[aria-expanded]` + nuevos asserts estado (Task 4) |

Existing files NOT modified: `components/code/agent-message.tsx`, `lib/features/code/types.ts`, `lib/features/code/file-browser/highlight.ts`.

---

### Task 1: Generalizar `Shimmer` a ReactNode

**Files:**
- Modify: `packages/chatbot/components/ui/shimmer.tsx`
- Test: `packages/chatbot/tests/component/ui/shimmer.test.tsx` (create)

**Interfaces:**
- Consumes: `motion/react`, `cn` helper
- Produces: `Shimmer({ children: React.ReactNode, as?, className?, duration?, spread?, textLength?: number })` — `textLength` override para calcular `--spread` cuando children no es string.

- [ ] **Step 1: Write failing test for ReactNode children**

Create `packages/chatbot/tests/component/ui/shimmer.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Shimmer } from "@/components/ui/shimmer";

describe("Shimmer ReactNode", () => {
  it("renders ReactNode children with shimmer classes", () => {
    const { container } = render(
      <Shimmer as="span" textLength={10}>
        <span>Shell</span> <span>ls -la</span>
      </Shimmer>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.textContent).toBe("Shell ls -la");
    expect(el.className).toContain("bg-clip-text");
    expect(el.className).toContain("text-transparent");
  });

  it("still works with string children (backwards compat)", () => {
    const { container } = render(<Shimmer>hello world</Shimmer>);
    expect(container.textContent).toBe("hello world");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot test:component -- tests/component/ui/shimmer.test.tsx -v`
Expected: FAIL — `children` type error or `children.length` is undefined for ReactNode path.

- [ ] **Step 3: Implement minimal generalization**

Edit `packages/chatbot/components/ui/shimmer.tsx`:

Current signature:
```ts
export type TextShimmerProps = {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
};
```

Change to:
```ts
export type TextShimmerProps = {
  children: React.ReactNode;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
  textLength?: number;
};
```

Update `ShimmerComponent`:
- Destructure `textLength` prop.
- Replace `dynamicSpread`:
```ts
const dynamicSpread = useMemo(() => {
  const len = textLength ?? (typeof children === "string" ? children.length : 0) * 1 || 24;
  // Actually: if children is string use its length; else use textLength or fallback 24
  if (typeof children === "string") return children.length * spread;
  return (textLength ?? 24) * spread; // fallback razonable para ReactNode sin textLength
}, [children, spread, textLength]);
```
Simpler exact code:
```ts
const dynamicSpread = useMemo(() => {
  const len = textLength ?? (typeof children === "string" ? children.length : 12);
  return len * spread;
}, [children, spread, textLength]);
```
- Keep rest identical (motion, bg, etc). Ensure `children` is passed through as-is to `MotionComponent`.

Full file after edit should still export `Shimmer = memo(ShimmerComponent)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chatbot test:component -- tests/component/ui/shimmer.test.tsx -v`
Expected: PASS (2 tests). Also verify existing usage not broken: `pnpm --filter chatbot test:component -- tests/component/agent-code/markdown-preview.test.tsx -v` still passes (ReasoningBlock uses Shimmer with string).

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/components/ui/shimmer.tsx packages/chatbot/tests/component/ui/shimmer.test.tsx
git commit -m "feat(chatbot): generalize Shimmer to ReactNode

Co-Authored-By: pi <noreply@pi-coding-agent>"
```

---

### Task 2: Crear `HighlightedCode` (renderizador shiki async)

**Files:**
- Create: `packages/chatbot/components/code/highlighted-code.tsx`
- Test: `packages/chatbot/tests/component/agent-code/highlighted-code.test.tsx`

**Interfaces:**
- Consumes: `tokenize` from `@/lib/features/code/file-browser/highlight`, `useTheme` from `next-themes`, `DARK_THEME`/`LIGHT_THEME`, `ThemedToken` type from `shiki`
- Produces: `HighlightedCode({ content: string, language: string, className?: string }) => JSX.Element`

- [ ] **Step 1: Write failing test**

Create `packages/chatbot/tests/component/agent-code/highlighted-code.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

// Mock highlight.ts to avoid loading real shiki in jsdom
vi.mock("@/lib/features/code/file-browser/highlight", () => ({
  DARK_THEME: "github-dark",
  LIGHT_THEME: "github-light",
  tokenize: vi.fn(async (content: string) => {
    // Simulate shiki tokens: one token per line segment
    return content.split("\n").map((line) => [
      { content: line || "\n", color: "#ff0000" },
    ]);
  }),
}));

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

const { HighlightedCode } = await import("@/components/code/highlighted-code");

describe("HighlightedCode", () => {
  it("renders fallback plaintext while loading then highlighted spans", async () => {
    const { container, getByText } = render(
      <HighlightedCode content='{"a":1}' language="json" />
    );
    // Initially fallback <pre> with raw content exists
    expect(container.querySelector("pre")?.textContent).toContain('{"a":1}');
    await waitFor(() => {
      const spans = container.querySelectorAll("span[style]");
      expect(spans.length).toBeGreaterThan(0);
      expect(spans[0].getAttribute("style")).toContain("color");
    });
  });

  it("renders empty placeholder for empty content", async () => {
    const { container } = render(<HighlightedCode content="" language="json" />);
    expect(container.textContent).toContain("(empty)");
  });

  it("falls back to plaintext when tokenize throws", async () => {
    const { tokenize } = await import("@/lib/features/code/file-browser/highlight");
    vi.mocked(tokenize).mockRejectedValueOnce(new Error("fail"));
    const { container } = render(<HighlightedCode content="hello" language="json" />);
    await waitFor(() => {
      expect(container.querySelector("pre")?.textContent).toContain("hello");
    });
  });
});
```

Note: adjust mock import path if needed; use `vi.mock` hoisting correctly (put mocks at top, dynamic import after).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot test:component -- tests/component/agent-code/highlighted-code.test.tsx -v`
Expected: FAIL — `Cannot find module '@/components/code/highlighted-code'`.

- [ ] **Step 3: Implement minimal HighlightedCode**

Create `packages/chatbot/components/code/highlighted-code.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import type { ThemedToken } from "shiki";
import { DARK_THEME, LIGHT_THEME, tokenize } from "@/lib/features/code/file-browser/highlight";
import { cn } from "@/lib/utils/helpers";

export interface HighlightedCodeProps {
  content: string;
  language: string;
  className?: string;
}

export const HighlightedCode: React.FC<HighlightedCodeProps> = ({ content, language, className }) => {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);

  useEffect(() => {
    if (!content) {
      setTokens(null);
      return;
    }
    let cancelled = false;
    setTokens(null); // reset to fallback while re-tokenizing (theme/content change)
    tokenize(content, language, theme)
      .then((t) => {
        if (!cancelled) setTokens(t);
      })
      .catch(() => {
        if (!cancelled) setTokens(null);
      });
    return () => {
      cancelled = true;
    };
  }, [content, language, theme]);

  if (!content) {
    return (
      <pre className={cn("p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto text-muted-foreground", className)}>
        (empty)
      </pre>
    );
  }

  if (!tokens) {
    return (
      <pre className={cn("p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto text-muted-foreground", className)}>
        {content}
      </pre>
    );
  }

  return (
    <pre className={cn("p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto", className)}>
      {tokens.map((line, i) => (
        <div key={i} className="leading-5 min-h-[1.25rem]">
          {line.length === 0 ? (
            "\n"
          ) : (
            line.map((tok, j) => (
              <span key={j} style={{ color: tok.color }}>
                {tok.content}
              </span>
            ))
          )}
        </div>
      ))}
    </pre>
  );
};
```

Key points:
- `useEffect` cancellation guard.
- Fallback plaintext while loading or on error (no colored spans).
- Empty content placeholder.
- Rendering mirrors `CodeViewLine` pattern: `span style={{color}}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chatbot test:component -- tests/component/agent-code/highlighted-code.test.tsx -v`
Expected: PASS (3 tests).

Also run full component suite sanity: `pnpm --filter chatbot test:component -v 2>&1 | tail -20` should still show previous suites passing.

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/components/code/highlighted-code.tsx packages/chatbot/tests/component/agent-code/highlighted-code.test.tsx
git commit -m "feat(chatbot): add HighlightedCode shiki renderer

Co-Authored-By: pi <noreply@pi-coding-agent>"
```

---

### Task 3: Crear `ToolCallDetail` (borde izquierdo + Parameters/Result)

**Files:**
- Create: `packages/chatbot/components/code/tool-call-detail.tsx`
- Test: `packages/chatbot/tests/component/agent-code/tool-call-detail.test.tsx`

**Interfaces:**
- Consumes: `HighlightedCode` from `./highlighted-code`, `SubagentToolLink` from `./subagent-tool-link`, `useFileBrowserIds` from `./file-browser/file-browser-provider`, `ToolCallGroup` type
- Produces: `ToolCallDetail({ group: ToolCallGroup, expanded: boolean, onExpand: () => void })` — note: parent manages `expanded` for clamp; or internal state? Spec says `ToolCallGroup` manages open + expanded. For `ToolCallDetail`, expose `group` + `expanded/onExpand` or manage internally. Decision: manage clamp internally (own `expanded` state) to keep caller simple; but to allow test control, accept optional `clampLines` prop. Simplest: internal `useState(false)` for "Show more". Provide both: internal state, no props needed beyond `group`.

Final props:
```ts
interface ToolCallDetailProps { group: ToolCallGroup }
```

Internal: `const [expanded, setExpanded] = useState(false)`.

- [ ] **Step 1: Write failing test**

Create `packages/chatbot/tests/component/agent-code/tool-call-detail.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import type { ToolCallGroup as Group } from "@/lib/features/code/types";

vi.mock("@/lib/features/code/actions", () => ({
  getSubagentSessionAction: vi.fn(async () => ({ error: "not found" })),
}));
vi.mock("@/lib/features/code/file-browser/highlight", () => ({
  DARK_THEME: "github-dark",
  LIGHT_THEME: "github-light",
  tokenize: vi.fn(async (c: string) => c.split("\n").map((l) => [{ content: l || "\n", color: "#000" }])),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

const { ToolCallDetail } = await import("@/components/code/tool-call-detail");

const base: Group = {
  id: "t1",
  name: "bash",
  args: '{"command":"ls -la"}',
  status: "ok",
  summary: "ls -la",
};

afterEach(cleanup);

describe("ToolCallDetail", () => {
  it("renders Parameters label and highlighted args", async () => {
    const { findByText } = render(<ToolCallDetail group={base} />);
    expect(await findByText("Parameters")).toBeDefined();
    expect(await findByText(/ls -la/)).toBeDefined();
  });

  it("renders Result when result exists", async () => {
    const { findByText } = render(<ToolCallDetail group={{ ...base, result: "hello world" }} />);
    expect(await findByText("Result")).toBeDefined();
    expect(await findByText(/hello world/)).toBeDefined();
  });

  it("does not render Result when result is undefined", async () => {
    const { queryByText } = render(<ToolCallDetail group={base} />);
    // wait a tick for mocks
    await new Promise((r) => setTimeout(r, 0));
    expect(queryByText("Result")).toBeNull();
  });

  it("clamps long result to 20 lines and shows Show more", async () => {
    const long = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const { findByText, queryByText } = render(<ToolCallDetail group={{ ...base, result: long }} />);
    expect(await findByText("Show more")).toBeDefined();
    // only first 20 lines visible initially
    expect(queryByText("line 25")).toBeNull();
    fireEvent.click(await findByText("Show more"));
    expect(await findByText("line 25")).toBeDefined();
  });

  it("has left border container class", async () => {
    const { container } = render(<ToolCallDetail group={base} />);
    await new Promise((r) => setTimeout(r, 0));
    const borderEl = container.querySelector(".border-l-2");
    expect(borderEl).not.toBeNull();
    expect(borderEl?.className).toContain("border-zinc-300");
  });

  it("shows placeholder when args empty", async () => {
    const { findByText } = render(<ToolCallDetail group={{ ...base, args: "" }} />);
    expect(await findByText("(no parameters)")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot test:component -- tests/component/agent-code/tool-call-detail.test.tsx -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal ToolCallDetail**

Create `packages/chatbot/components/code/tool-call-detail.tsx`:

```tsx
"use client";

import { useState, useMemo } from "react";
import { HighlightedCode } from "./highlighted-code";
import { useFileBrowserIds } from "./file-browser/file-browser-provider";
import { SubagentToolLink } from "./subagent-tool-link";
import type { ToolCallGroup as Group } from "@/lib/features/code/types";

const MAX_LINES = 20;

function prettyArgs(args: string): { content: string; language: string } {
  if (!args || args.trim() === "" || args.trim() === "{}") {
    return { content: "(no parameters)", language: "plaintext" };
  }
  try {
    const parsed = JSON.parse(args);
    return { content: JSON.stringify(parsed, null, 2), language: "json" };
  } catch {
    return { content: args, language: "plaintext" };
  }
}

function detectResult(result: string): { content: string; language: string } {
  const trimmed = result.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed === "object" && parsed !== null) {
        return { content: JSON.stringify(parsed, null, 2), language: "json" };
      }
    } catch {
      // fall through
    }
  }
  return { content: result, language: "plaintext" };
}

export interface ToolCallDetailProps {
  group: Group;
}

export const ToolCallDetail: React.FC<ToolCallDetailProps> = ({ group }) => {
  const [expanded, setExpanded] = useState(false);
  const fileBrowserIds = useFileBrowserIds();

  const argsInfo = useMemo(() => prettyArgs(group.args), [group.args]);

  const resultInfo = useMemo(() => {
    if (group.result === undefined) return null;
    const lines = group.result.split("\n");
    const clamped = lines.length > MAX_LINES && !expanded;
    const visible = clamped ? lines.slice(0, MAX_LINES).join("\n") : group.result;
    const detected = detectResult(visible);
    // If clamped, we already truncated; detection runs on truncated visible
    // When expanded, detection runs on full result
    return { ...detected, clamped, fullLines: lines.length };
  }, [group.result, expanded]);

  const isError = group.status === "error";

  return (
    <div className="ml-2 pl-4 my-2 border-l-2 border-zinc-300 dark:border-zinc-600 flex flex-col gap-4">
      <div>
        <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-1.5">
          Parameters
        </div>
        <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
          {argsInfo.content === "(no parameters)" ? (
            <pre className="p-3 text-xs font-mono text-muted-foreground">(no parameters)</pre>
          ) : (
            <HighlightedCode content={argsInfo.content} language={argsInfo.language} />
          )}
        </div>
      </div>

      {group.name === "subagent" && fileBrowserIds && (
        <SubagentToolLink
          project={fileBrowserIds.project}
          parentSessionId={fileBrowserIds.sessionId}
          toolCallId={group.id}
        />
      )}

      {resultInfo && (
        <div>
          <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-1.5">
            Result
          </div>
          <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
            <HighlightedCode
              content={resultInfo.content}
              language={resultInfo.language}
              className={isError ? "text-red-600 dark:text-red-400" : undefined}
            />
            {resultInfo.clamped && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="block w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 border-t border-border"
              >
                Show more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
```

Note: `HighlightedCode` error coloring via className override won't color inner spans (they have inline `color`). Alternative: when `isError`, pass `language="plaintext"` and render `<pre class="text-red-600">` fallback without shiki colors. Simpler: if `isError`, don't use HighlightedCode, render `<pre class="p-3 text-xs font-mono whitespace-pre-wrap text-red-600">` directly. Adjust implementation accordingly if the className approach doesn't override inline styles. Preferred fix for error: render plain red pre.

Update result rendering for error case:
```tsx
{isError ? (
  <pre className="p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto text-red-600 dark:text-red-400">{resultInfo.content}</pre>
) : (
  <HighlightedCode content={resultInfo.content} language={resultInfo.language} />
)}
```

Include this variation.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chatbot test:component -- tests/component/agent-code/tool-call-detail.test.tsx -v`
Expected: PASS (6 tests). Iterate until green.

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/components/code/tool-call-detail.tsx packages/chatbot/tests/component/agent-code/tool-call-detail.test.tsx
git commit -m "feat(chatbot): add ToolCallDetail with left border and highlighted containers

Co-Authored-By: pi <noreply@pi-coding-agent>"
```

---

### Task 4: Reescribir `ToolCallGroup` a fila compacta Codex-style

**Files:**
- Modify: `packages/chatbot/components/code/tool-call-group.tsx`
- Modify: `packages/chatbot/tests/component/agent-code/tool-call-group.test.tsx`

**Interfaces:**
- Consumes: `ToolCallDetail` from `./tool-call-detail`, `Shimmer` from `@/components/ui/shimmer`, `TOOL_ICONS`/`TOOL_DISPLAY_NAMES` (kept), `ToolCallGroup` type
- Produces: `ToolCallGroup({ group: Group })` — same public props, new DOM: `button[aria-expanded]` + `{open && <ToolCallDetail group={group} />}`

- [ ] **Step 1: Write failing tests (migrate existing + add new)**

Update `packages/chatbot/tests/component/agent-code/tool-call-group.test.tsx` to reflect new design. Keep helpers but replace `<details>` mechanics.

New test file content (showing key cases; preserve existing 4 tests migrated):

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import type { ToolCallGroup as Group } from "@/lib/features/code/types";

vi.mock("@/lib/features/code/actions", () => ({
  getSubagentSessionAction: vi.fn(async () => ({ error: "not found" })),
}));
vi.mock("@/lib/features/code/file-browser/highlight", () => ({
  DARK_THEME: "github-dark",
  LIGHT_THEME: "github-light",
  tokenize: vi.fn(async (c: string) => c.split("\n").map((l) => [{ content: l || "\n", color: "#000" }])),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

const { ToolCallGroup } = await import("@/components/code/tool-call-group");

const base: Group = {
  id: "t1",
  name: "bash",
  args: '{"command":"ls -la"}',
  status: "ok",
  summary: "ls -la",
};

afterEach(cleanup);

const openGroup = (container: HTMLElement) => {
  const btn = container.querySelector('button[aria-expanded]') as HTMLButtonElement;
  fireEvent.click(btn);
};

describe("ToolCallGroup", () => {
  it("renders no detail while collapsed", () => {
    const { queryByText } = render(<ToolCallGroup group={{ ...base, result: "out" }} />);
    expect(queryByText("Parameters")).toBeNull();
    expect(queryByText("Result")).toBeNull();
  });

  it("renders detail once opened", async () => {
    const { container, findByText } = render(<ToolCallGroup group={{ ...base, result: "out" }} />);
    openGroup(container);
    expect(await findByText("Parameters")).toBeDefined();
    expect(await findByText("Result")).toBeDefined();
  });

  it("clamps long output and shows Show more", async () => {
    const long = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const { container, findByText } = render(<ToolCallGroup group={{ ...base, result: long }} />);
    openGroup(container);
    expect(await findByText("Show more")).toBeDefined();
  });

  it("applies shimmer in running state", () => {
    const { container } = render(<ToolCallGroup group={{ ...base, status: "running" }} />);
    // Shimmer renders with bg-clip-text
    expect(container.querySelector(".bg-clip-text")).not.toBeNull();
  });

  it("applies red styling in error state", () => {
    const { container } = render(<ToolCallGroup group={{ ...base, status: "error" }} />);
    const row = container.querySelector('button[aria-expanded]') as HTMLElement;
    expect(row.className).toContain("text-red-600");
  });

  it("truncates summary aggressively with title tooltip", () => {
    const longSummary = "a".repeat(200);
    const { container } = render(<ToolCallGroup group={{ ...base, summary: longSummary }} />);
    const summaryEl = container.querySelector('[title]') as HTMLElement;
    expect(summaryEl).not.toBeNull();
    expect(summaryEl.className).toContain("max-w-48");
    expect(summaryEl.className).toContain("truncate");
  });

  it("toggles aria-expanded on click", () => {
    const { container } = render(<ToolCallGroup group={base} />);
    const btn = container.querySelector('button[aria-expanded]') as HTMLElement;
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot test:component -- tests/component/agent-code/tool-call-group.test.tsx -v`
Expected: FAIL — old `<details>` not found, or Shimmer/Detail missing.

- [ ] **Step 3: Implement minimal rewrite of ToolCallGroup**

Edit `packages/chatbot/components/code/tool-call-group.tsx` — full rewrite:

```tsx
"use client";

import * as React from "react";
import { useState, useCallback } from "react";
import {
  Terminal,
  FileText,
  FilePlus,
  Pencil,
  Search,
  FolderOpen,
  Wrench,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { Shimmer } from "@/components/ui/shimmer";
import { ToolCallDetail } from "./tool-call-detail";
import type { ToolCallGroup as Group } from "@/lib/features/code/types";
import { cn } from "@/lib/utils/helpers";

const TOOL_ICONS: Record<string, LucideIcon> = {
  bash: Terminal, shell: Terminal,
  read: FileText, write: FilePlus, edit: Pencil,
  grep: Search, find: FolderOpen, ls: FolderOpen, subagent: Bot,
};

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  bash: "Shell", shell: "Shell",
  read: "Read", write: "Write", edit: "Edit",
  grep: "Grep", find: "Find", ls: "Ls", subagent: "Subagent",
};

export interface ToolCallGroupProps { group: Group }

export const ToolCallGroup = React.memo<ToolCallGroupProps>(
  ({ group }) => {
    const [open, setOpen] = useState(false);
    const toggle = useCallback(() => setOpen((v) => !v), []);
    const Icon = TOOL_ICONS[group.name.toLowerCase()] ?? Wrench;
    const displayName = TOOL_DISPLAY_NAMES[group.name.toLowerCase()] ?? group.name;
    const isRunning = group.status === "running";
    const isError = group.status === "error";

    const rowColor = isError
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";

    return (
      <div data-testid="tool-call-group" data-tool={group.name} data-status={group.status} className="w-fit max-w-full">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`tool-detail-${group.id}`}
          onClick={toggle}
          title={group.summary}
          className={cn(
            "flex items-center gap-2 py-1.5 text-sm w-fit max-w-full text-left hover:bg-muted/40 rounded-md -mx-1 px-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            rowColor
          )}
        >
          <Icon className={cn("size-4 shrink-0", rowColor)} />
          {isRunning ? (
            <Shimmer as="span" className="inline-flex items-center gap-1.5 min-w-0" textLength={displayName.length + group.summary.length}>
              <span className="font-medium shrink-0">{displayName}</span>
              <span className="truncate max-w-48 min-w-0">{group.summary}</span>
            </Shimmer>
          ) : (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span className="font-medium shrink-0">{displayName}</span>
              <span className="truncate max-w-48 min-w-0">{group.summary}</span>
            </span>
          )}
        </button>
        {open && (
          <div id={`tool-detail-${group.id}`}>
            <ToolCallDetail group={group} />
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    const p = prev.group, n = next.group;
    return (
      p.id === n.id && p.name === n.name && p.status === n.status &&
      p.result === n.result && p.startedAt === n.startedAt &&
      p.finishedAt === n.finishedAt && p.summary === n.summary && p.args === n.args
    );
  }
);

ToolCallGroup.displayName = "ToolCallGroup";
```

Notes:
- Removed `Loader2`/`Check`/`X`/`ChevronDown` imports (no longer needed).
- Removed `MAX_LINES`/clamp logic (moved to ToolCallDetail).
- Outer div `w-fit max-w-full` ensures not full-width pill.
- `title={group.summary}` for tooltip on truncated text.
- Memo comparator unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
pnpm --filter chatbot test:component -- tests/component/agent-code/tool-call-group.test.tsx tests/component/agent-code/tool-call-detail.test.tsx tests/component/agent-code/highlighted-code.test.tsx tests/component/ui/shimmer.test.tsx -v
```
Expected: PASS all.

Then full fast verify:
```bash
pnpm verify:fast 2>&1 | tail -40
```
Expected: lint + type-check + unit/component/integration/contract all PASS.

Manual verification checklist (do in dev):
- `pnpm dev`, open coding agent session, trigger tools: running row shimmers, ok row muted, error row red, click row expands with left border + Parameters/Result containers highlighted, Show more works, truncado agresivo + tooltip.

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/components/code/tool-call-group.tsx packages/chatbot/tests/component/agent-code/tool-call-group.test.tsx
git commit -m "feat(chatbot): redesign tool calls to Codex-style compact rows

Co-Authored-By: pi <noreply@pi-coding-agent>"
```

---

## Self-Review Checklist

After writing plan, verify:

- [x] Spec §3.1 file map covered: Shimmer, HighlightedCode, ToolCallDetail, ToolCallGroup all have tasks.
- [x] Spec §3.2 row spec: w-fit, no border, icon+name+summary, max-w-48 truncate, title, hover, a11y — in Task 4.
- [x] Spec §3.2 states: running shimmer, ok muted, error red — in Task 4.
- [x] Spec §3.3 detail: left border exact class, uppercase labels, rounded containers, prettyArgs, detectResult, clamp 20 + Show more, SubagentToolLink, error red pre — in Task 3.
- [x] Spec §3.4 HighlightedCode: async tokenize, theme, cancellation, fallback — in Task 2.
- [x] Spec §3.5 Shimmer generalization — Task 1.
- [x] Spec §7 tests migration + new tests — Tasks 1-4 each have test steps.
- [x] No placeholders: all steps contain actual code blocks and exact `pnpm` commands.
- [x] Type consistency: `ToolCallGroup` imported from `@/lib/features/code/types`, `ThemedToken` from `shiki`, `ToolCallDetail` props consistent between Task 3 impl and Task 4 consumption.

