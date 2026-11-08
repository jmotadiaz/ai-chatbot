/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { Message } from "@ag-ui/client";
import type { ReActCycle } from "@/lib/features/code/react-cycles";
import type { ToolCallGroup as Group } from "@/lib/features/code/types";

vi.mock("@/lib/features/code/actions", () => ({
  getSubagentSessionAction: vi.fn(async () => ({ error: "not found" })),
}));
vi.mock("@/lib/features/code/file-browser/highlight", () => ({
  DARK_THEME: "github-dark",
  LIGHT_THEME: "github-light",
  tokenize: vi.fn(async (c: string) =>
    c.split("\n").map((l) => [{ content: l || "\n", color: "#000" }]),
  ),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

const { ReActCycleView } = await import("@/components/code/react-cycle");

function reasoningMessage(id: string, content: string): Message {
  return { id, role: "reasoning", content } as Message;
}

function group(id: string, overrides: Partial<Group> = {}): Group {
  return {
    id,
    name: "bash",
    args: '{"command":"pnpm test"}',
    status: "ok",
    summary: "pnpm test",
    result: "ok",
    ...overrides,
  };
}

function cycle(steps: ReActCycle["steps"]): ReActCycle {
  return { id: "cycle:r:a1", originMessageId: "a1", steps };
}

const reasoningCycle = cycle([
  { kind: "reasoning", id: "a1", message: reasoningMessage("a1", "delta taken") },
  { kind: "tool", id: "t1", group: group("t1") },
]);

afterEach(cleanup);

const trigger = (container: HTMLElement) =>
  container.querySelector("[data-slot='collapsible-trigger']") as HTMLElement;

describe("ReActCycleView", () => {
  it("starts collapsed and names the finished cycle", () => {
    const { container } = render(
      <ReActCycleView cycle={reasoningCycle} active={false} />,
    );
    expect(trigger(container).textContent).toContain("1 thought · 1 tool");
    expect(container.querySelector("[data-testid='tool-call-group']")).toBeNull();
    expect(trigger(container).getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the unchanged reasoning and tool rows once opened", () => {
    const { container, getByText } = render(
      <ReActCycleView cycle={reasoningCycle} active={false} />,
    );
    fireEvent.click(trigger(container));
    expect(container.querySelector("[data-testid='tool-call-group']")).not.toBeNull();
    expect(getByText("Thinking")).toBeDefined();
  });

  it("names a single running tool in the trigger", () => {
    const { container } = render(
      <ReActCycleView
        cycle={cycle([
          { kind: "tool", id: "t1", group: group("t1", { status: "running" }) },
        ])}
        active
      />,
    );
    expect(trigger(container).textContent).toContain("Shell pnpm test");
    expect(container.querySelector(".bg-clip-text")).not.toBeNull();
  });

  it("names parallel calls by tool type", () => {
    const { container } = render(
      <ReActCycleView
        cycle={cycle([
          { kind: "tool", id: "t1", group: group("t1", { status: "running" }) },
          {
            kind: "tool",
            id: "t2",
            group: group("t2", { name: "subagent", summary: "explore", status: "running" }),
          },
          {
            kind: "tool",
            id: "t3",
            group: group("t3", { name: "subagent", summary: "verify", status: "running" }),
          },
        ])}
        active
      />,
    );
    expect(trigger(container).textContent).toContain("3 tools: Shell; Subagents");
  });

  it("falls back to Thinking between a finished tool and the next chunk", () => {
    const { container } = render(
      <ReActCycleView
        cycle={cycle([
          { kind: "tool", id: "t1", group: group("t1") },
        ])}
        active
      />,
    );
    expect(trigger(container).textContent).toContain("Thinking");
  });

  it("marks a failed cycle in red", () => {
    const { container } = render(
      <ReActCycleView
        cycle={cycle([
          { kind: "tool", id: "t1", group: group("t1", { status: "error" }) },
        ])}
        active={false}
      />,
    );
    expect(trigger(container).textContent).toContain("1 tool · 1 error");
    expect(trigger(container).className).toContain("text-base");
    expect(container.querySelector(".text-red-600")).not.toBeNull();
  });

  it("matches the Thinking label typography and keeps the chevron beside it", () => {
    const { container } = render(
      <ReActCycleView cycle={reasoningCycle} active={false} />,
    );
    const element = trigger(container);
    // Same size as the reasoning trigger it aggregates, with no left offset.
    expect(element.className).toContain("text-base");
    expect(element.className).not.toMatch(/\b(px-|pl-|ml-)/);
    // The chevron is not pushed to the far edge: it shares the label's tone.
    const label = element.querySelector("span[title]");
    const chevron = element.querySelector("svg:last-of-type");
    expect(label?.className).not.toContain("flex-1");
    expect(chevron?.getAttribute("class")).toContain("text-zinc-500");
  });

  it("gives Thinking the same room above it as under the cycle label", () => {
    const { container } = render(
      <ReActCycleView
        cycle={cycle([
          { kind: "reasoning", id: "a1", message: reasoningMessage("a1", "first") },
          { kind: "tool", id: "t1", group: group("t1") },
          { kind: "reasoning", id: "a2", message: reasoningMessage("a2", "second") },
        ])}
        active={false}
      />,
    );
    fireEvent.click(trigger(container));

    // The rail spaces its children by gap-1 and the trigger pads 1.5, so a
    // Thinking that follows a tool only matches the first one's gap under the
    // label when it carries its own symmetric mt-2/mb-2 (over the shared mb-4).
    const reasoningBlocks = Array.from(
      container.querySelectorAll("[data-slot='collapsible']"),
    ).slice(1);
    expect(reasoningBlocks).toHaveLength(2);
    for (const block of reasoningBlocks) {
      expect(block.className).toContain("mt-2");
      expect(block.className).toContain("mb-2");
      expect(block.className).not.toContain("mb-4");
    }
  });

  it("shimmers while active and renders a static label once finished", () => {
    const { container, rerender } = render(
      <ReActCycleView cycle={reasoningCycle} active />,
    );

    const shimmer = container.querySelector(".bg-clip-text");
    expect(shimmer).not.toBeNull();
    // A colour utility on the shimmer element would win over its own
    // `text-transparent` and paint over the sweep.
    expect(shimmer?.getAttribute("class")).not.toMatch(
      /\btext-(zinc|red|foreground|muted)/,
    );
    expect(trigger(container).textContent).toContain("Thinking");

    rerender(<ReActCycleView cycle={reasoningCycle} active={false} />);

    expect(container.querySelector(".bg-clip-text")).toBeNull();
    expect(trigger(container).textContent).toContain("1 thought · 1 tool");
  });

  it("keeps the user's open state when the cycle finishes", () => {
    const { container, rerender } = render(
      <ReActCycleView cycle={reasoningCycle} active />,
    );
    fireEvent.click(trigger(container));
    expect(trigger(container).getAttribute("aria-expanded")).toBe("true");

    rerender(<ReActCycleView cycle={reasoningCycle} active={false} />);

    expect(trigger(container).getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("[data-testid='tool-call-group']")).not.toBeNull();
  });
});
