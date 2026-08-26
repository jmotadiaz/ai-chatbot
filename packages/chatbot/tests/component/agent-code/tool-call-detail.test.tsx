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
