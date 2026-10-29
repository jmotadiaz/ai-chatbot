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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders fallback plaintext while loading then highlighted spans", async () => {
    const { container } = render(
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
