/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// Header building blocks pull app-level providers (next-auth) and server
// actions (DB) into the jsdom environment.
vi.mock("@/app/providers", () => ({
  useSidebarContext: () => ({
    showSidebar: false,
    setShowSidebar: () => {},
    toggleSidebar: () => {},
  }),
}));
vi.mock("@/app/actions/theme", () => ({ updateTheme: vi.fn() }));
// The nested SubagentToolLink imports the "use server" actions module, which
// pulls server-only deps (DB, tracing sinks) into the jsdom environment.
vi.mock("@/lib/features/code/actions", () => ({
  getSubagentSessionAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// jsdom in this setup does not expose the CSS global the Textarea autosize
// effect probes.
vi.stubGlobal("CSS", { supports: () => true });

// Everything the skeletons are actually asserted on — the conversation panel,
// the composer and the controls — stays real, so drift from the views they
// stand in for fails here.
const {
  AgentCodeChatSkeleton,
  FileBrowserSkeleton,
  SubagentSessionSkeleton,
} = await import("@/components/code/coding-agent-skeletons");

afterEach(cleanup);

describe("coding agent loading skeletons", () => {
  it("shows the empty conversation the real session shows before its first message", () => {
    render(<AgentCodeChatSkeleton />);

    // Same overview a message-less session renders, so resolving into one is
    // seamless rather than a swap.
    expect(screen.getByText("Coding Agent")).toBeTruthy();
  });

  it("renders the composer in its final position but refusing input", () => {
    render(<AgentCodeChatSkeleton />);

    const input = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    expect(input.placeholder).toBe("Ask the coding agent...");
    // Typing here would be discarded when the real page mounts its own
    // composer, so the skeleton must not invite it.
    expect(input.disabled).toBe(true);
  });

  it("offers nothing actionable while there is no session to act on", () => {
    render(<AgentCodeChatSkeleton />);

    const inert = screen
      .getAllByRole("button", { hidden: true })
      .filter((button) => button.getAttribute("aria-hidden") === "true");

    expect(inert.length).toBeGreaterThan(0);
    for (const button of inert) {
      // The send slot is the one exception: it carries the same spinner the
      // real page shows while a session loads, and ChatControl deliberately
      // leaves that variant enabled so a running turn stays cancellable.
      // Here it has no handler, so it is inert all the same.
      const isSpinner = button.querySelector(".animate-spin") !== null;
      expect(isSpinner || (button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("shows the send control as the spinner the real page shows while loading", () => {
    render(<AgentCodeChatSkeleton />);

    const spinners = screen
      .getAllByRole("button", { hidden: true })
      .filter((button) => button.querySelector(".animate-spin") !== null);

    expect(spinners).toHaveLength(1);
  });

  it("drops the composer for the read-only subagent view", () => {
    render(<SubagentSessionSkeleton />);

    expect(screen.getByText("Coding Agent")).toBeTruthy();
    expect(screen.queryByTestId("chat-input")).toBeNull();
  });

  it("renders the file browser frame without guessing at its contents", () => {
    render(<FileBrowserSkeleton />);

    expect(screen.getByTestId("file-browser-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("chat-input")).toBeNull();
  });
});
