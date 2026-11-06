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

  it("is not a scroll anchor: it carries no user role", () => {
    // `[data-role="user"]` is what prev/next navigation walks, so a derived
    // bubble wearing it would hijack the anchor while the turn still runs.
    renderConversation({ steeringPending: "no soy un ancla" });

    const bubble = screen.getByTestId("steering-pending-bubble");
    expect(bubble.getAttribute("data-role")).toBeNull();
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
describe("AgentConversation Message Edit dimming", () => {
  const items = [
    { kind: "user" as const, message: { id: "u1", role: "user" as const, content: "one" } },
    {
      kind: "assistant" as const,
      message: { id: "a1", role: "assistant" as const, content: "answer one" },
      toolGroups: [],
    },
    { kind: "user" as const, message: { id: "u2", role: "user" as const, content: "two" } },
    {
      kind: "assistant" as const,
      message: { id: "a2", role: "assistant" as const, content: "answer two" },
      toolGroups: [],
    },
  ];

  const abandonedFlags = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("[data-abandoned]")).map((el) =>
      el.textContent?.includes("answer one") ? "kept" : "abandoned",
    );

  it("dims everything after the Message being edited", () => {
    const { container } = renderConversation({ items, editingMessageId: "u2" });

    // Only the Turn answering u2 is dimmed; the edited Message itself and
    // everything before it stay at full opacity.
    expect(abandonedFlags(container)).toEqual(["abandoned"]);
    expect(
      container.querySelector('[data-abandoned="true"]')?.textContent,
    ).toContain("answer two");
  });

  it("dims nothing when no Message is being edited", () => {
    const { container } = renderConversation({ items, editingMessageId: null });
    expect(container.querySelectorAll("[data-abandoned]")).toHaveLength(0);
  });
});
