/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// AgentMessage reaches SubagentToolLink, which pulls in the "use server"
// actions module, whose next-auth import does not resolve under vitest.
vi.mock("@/lib/features/code/actions", () => ({
  getSubagentSessionAction: vi.fn(async () => ({ error: "not found" })),
}));

const { AgentMessage } = await import("@/components/code/agent-message");

afterEach(cleanup);

describe("coding-agent user skill chips", () => {
  it("renders leading skill commands as chips instead of message text", () => {
    render(
      <AgentMessage
        message={{
          id: "u1",
          role: "user",
          content:
            "/skill:code-review /skill:find-docs\n\nReview this change",
        }}
      />,
    );

    expect(screen.getByText("code-review")).toBeDefined();
    expect(screen.getByText("find-docs")).toBeDefined();
    expect(screen.getByText("Review this change")).toBeDefined();
    expect(screen.queryByText("/skill:code-review")).toBeNull();
  });
});
