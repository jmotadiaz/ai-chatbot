// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/features/code/hooks/use-coding-agent", () => ({
  useCodingAgent: vi.fn(() => ({ items: [], status: "idle", error: null })),
}));
// The nested SubagentToolLink imports the "use server" actions module, which
// pulls server-only deps (DB, tracing sinks) into the jsdom environment.
vi.mock("@/lib/features/code/actions", () => ({
  getSubagentSessionAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
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

const { SubagentSessionView } = await import("@/components/code/subagent-session-view");
const { useCodingAgent } = await import("@/lib/features/code/hooks/use-coding-agent");

afterEach(cleanup);

describe("SubagentSessionView", () => {
  it("feeds the hook with sub session and parent ids", () => {
    render(
      <SubagentSessionView project="proj" parentSessionId="p" subSessionId="c" subPiSessionId="pi-c" />,
    );
    expect(useCodingAgent).toHaveBeenCalledWith(
      expect.objectContaining({ project: "proj", sessionId: "c", parentSessionId: "p", piSessionId: "pi-c" }),
    );
  });

  it("renders a back link to the parent session and no composer", () => {
    render(
      <SubagentSessionView project="proj" parentSessionId="p" subSessionId="c" subPiSessionId="pi-c" />,
    );
    const back = screen.getByRole("link", { name: /sesión principal/i });
    expect(back.getAttribute("href")).toBe("/agent/code/proj/p");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
