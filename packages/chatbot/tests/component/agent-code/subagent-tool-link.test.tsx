/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/features/code/actions", () => ({
  getSubagentSessionAction: vi.fn(),
}));

const { getSubagentSessionAction } = await import("@/lib/features/code/actions");
const { SubagentToolLink } = await import("@/components/code/subagent-tool-link");

afterEach(cleanup);

describe("SubagentToolLink", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the link to the dedicated subagent route", async () => {
    vi.mocked(getSubagentSessionAction).mockResolvedValue({
      subSessionId: "child-1", subPiSessionId: "pi-child-1",
    });
    render(<SubagentToolLink project="proj" parentSessionId="p" toolCallId="tc-1" />);
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /sesión del subagente/i });
      expect(link.getAttribute("href")).toBe(
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
    expect(container.firstChild).toBeNull();
  });
});
