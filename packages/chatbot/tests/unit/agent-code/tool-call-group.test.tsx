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
