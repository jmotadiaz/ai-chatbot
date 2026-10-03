/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type * as React from "react";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// ToolCallDetail reaches SubagentToolLink, which imports the "use server"
// actions module (DB, auth) and breaks in jsdom.
vi.mock("@/lib/features/code/actions", () => ({
  getSubagentSessionAction: vi.fn(),
}));
// The header/footer building blocks pulled in by the conversation frame pull
// app-level providers (next-auth) and server actions (DB) into jsdom.
vi.mock("@/app/providers", () => ({
  useSidebarContext: () => ({
    showSidebar: false,
    setShowSidebar: () => {},
    toggleSidebar: () => {},
  }),
}));
vi.mock("@/app/actions/theme", () => ({ updateTheme: vi.fn() }));

const { AgentConversation } = await import(
  "@/components/code/agent-conversation"
);

afterEach(cleanup);

const renderConversation = (
  props: Partial<React.ComponentProps<typeof AgentConversation>> = {},
) =>
  render(
    <AgentConversation
      items={[]}
      isRunning={false}
      status={{ kind: "idle" } as unknown as AgentStatus}
      {...props}
    />,
  );

describe("AgentConversation steering bubble", () => {
  it("renders the pending text and the static badge when steering is armed", () => {
    renderConversation({ steeringPending: "hazlo también en el test" });

    const bubble = screen.getByTestId("steering-pending-bubble");
    expect(bubble).not.toBeNull();
    expect(bubble.textContent).toContain("hazlo también en el test");
    expect(screen.getByTestId("steering-pending-badge").textContent).toBe(
      "Pendiente de entrega",
    );
  });

  it("renders the bubble below the last item and above the running indicator", () => {
    renderConversation({
      items: [
        {
          kind: "assistant" as const,
          message: { id: "m1", role: "assistant" as const, content: "hola" },
          toolGroups: [],
        },
      ],
      isRunning: true,
      status: { kind: "thinking" } as unknown as AgentStatus,
      steeringPending: "para el test",
    });

    const body = screen.getByTestId("agent-status").parentElement;
    const children = Array.from(body?.children ?? []).map((el) =>
      el.getAttribute("data-testid"),
    );
    const bubbleIndex = children.indexOf("steering-pending-bubble");
    expect(bubbleIndex).toBeGreaterThan(0);
    expect(children[bubbleIndex + 1]).toBe("agent-status");
  });

  it("is read-only: no buttons, no links", () => {
    const { container } = renderConversation({ steeringPending: "sin acciones" });

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("renders nothing extra when steeringPending is null or undefined", () => {
    for (const steeringPending of [null, undefined, "", "   "]) {
      const { unmount } = renderConversation({ steeringPending });
      expect(screen.queryByTestId("steering-pending-bubble")).toBeNull();
      expect(screen.queryByTestId("steering-pending-badge")).toBeNull();
      unmount();
    }
  });
});