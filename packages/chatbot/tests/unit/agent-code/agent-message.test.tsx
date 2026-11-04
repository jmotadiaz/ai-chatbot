/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Message } from "@ag-ui/client";
import { FileBrowserProvider } from "@/components/code/file-browser/file-browser-provider";
import type { ResponsePendingComment } from "@/components/code/file-browser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// AgentMessage reaches SubagentToolLink, which pulls in the "use server"
// actions module, whose next-auth import does not resolve under vitest.
vi.mock("@/lib/features/code/actions", () => ({
  getSubagentSessionAction: vi.fn(async () => ({ error: "not found" })),
}));

const { AgentMessage } = await import("@/components/code/agent-message");

afterEach(cleanup);

const wrap = (ui: React.ReactNode) => (
  <FileBrowserProvider project="proj" sessionId="s1">
    {ui}
  </FileBrowserProvider>
);

describe("AgentMessage isolation and memoization", () => {
  it("renders commentable anchors only for assistant messages with turn numbers", () => {
    const assistantMsg: Message = {
      id: "a-1",
      role: "assistant",
      content: "# Final response",
    } as Message;

    const { container, rerender } = render(
      wrap(
        <AgentMessage
          message={assistantMsg}
          responseTurnNumber={1}
          responseComments={[]}
        />,
      ),
    );

    // Commentable anchor should be present
    expect(
      container.querySelector('[data-response-comment-block="1"]'),
    ).not.toBeNull();

    // Intermediate or non-final assistant without turn number: plain render
    rerender(wrap(<AgentMessage message={assistantMsg} />));
    expect(
      container.querySelector('[data-response-comment-block="1"]'),
    ).toBeNull();
  });

  it("never attaches comment anchors to reasoning or tool messages", () => {
    const reasoningMsg: Message = {
      id: "r-1",
      role: "reasoning",
      content: "internal thinking",
    } as Message;
    const toolMsg: Message = {
      id: "t-1",
      role: "tool",
      content: "tool output",
    } as Message;

    const { container: reasoningView } = render(
      wrap(
        <AgentMessage
          message={reasoningMsg}
          responseTurnNumber={1}
          responseComments={[]}
        />,
      ),
    );
    expect(
      reasoningView.querySelector("[data-response-comment-block]"),
    ).toBeNull();

    const { container: toolView } = render(
      wrap(
        <AgentMessage
          message={toolMsg}
          responseTurnNumber={1}
          responseComments={[]}
        />,
      ),
    );
    expect(toolView.querySelector("[data-response-comment-block]")).toBeNull();
  });

  it("re-renders when responseComments change and stays memoized when they are equal", () => {
    const assistantMsg: Message = {
      id: "a-1",
      role: "assistant",
      content: "# Heading",
    } as Message;

    const comment: ResponsePendingComment = {
      id: "c-1",
      kind: "response",
      messageId: "a-1",
      turnNumber: 1,
      startLine: 1,
      endLine: 1,
      lineText: "# Heading",
      text: "comentario",
      createdAt: 100,
    };

    const { container, rerender } = render(
      wrap(
        <AgentMessage
          message={assistantMsg}
          responseTurnNumber={1}
          responseComments={[]}
        />,
      ),
    );

    // Initially no comment indicator
    const blockBefore = container.querySelector(
      '[data-response-comment-block="1"]',
    );
    expect(blockBefore?.getAttribute("data-commented")).toBeNull();

    // Updating responseComments highlights the block
    rerender(
      wrap(
        <AgentMessage
          message={assistantMsg}
          responseTurnNumber={1}
          responseComments={[comment]}
        />,
      ),
    );

    const blockAfter = container.querySelector(
      '[data-response-comment-block="1"]',
    );
    expect(blockAfter?.getAttribute("data-commented")).toBe("true");
  });
});
