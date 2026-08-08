// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentCodeChat } from "@/components/code/agent-code-chat";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(() => Promise.resolve()),
  hookResult: {
    messages: [],
    items: [],
    toolErrors: new Map(),
    turnFiles: new Map(),
    isRunning: false,
    isLoading: false,
    sendMessage: vi.fn(() => Promise.resolve()),
    status: { kind: "idle" } as AgentStatus,
    error: null as string | null,
    cancel: undefined as unknown as () => Promise<void>,
  },
}));
mocks.hookResult.cancel = mocks.cancel;

vi.mock("@/lib/features/code/hooks/use-coding-agent", () => ({
  useCodingAgent: () => mocks.hookResult,
}));
vi.mock("@/lib/features/meta-prompt/hooks/use-prompt-refiner", () => ({
  usePromptRefiner: () => ({
    isLoadingRefinedPrompt: false,
    refinePrompt: vi.fn(),
    undo: vi.fn(),
    hasPreviousMessage: false,
  }),
}));
vi.mock("@/lib/features/code/hooks/use-coding-agent-skills", () => ({
  useCodingAgentSkills: () => ({
    skills: [
      { name: "code-review", description: "Review code changes" },
      { name: "find-docs", description: "Find current documentation" },
    ],
    isLoading: false,
    error: null,
  }),
}));
vi.mock("@/components/code/agent-conversation", () => ({
  AgentConversation: () => null,
}));
vi.mock("@/components/code/file-browser/file-browser-provider", () => ({
  useFileBrowser: () => ({
    state: { pendingComments: [] },
    actions: { clearComments: vi.fn() },
  }),
}));
vi.mock("@/components/code/file-browser/pending-comments-bar", () => ({
  PendingCommentsBar: () => null,
}));

// jsdom in this setup does not expose the CSS global the Textarea autosize
// effect probes.
vi.stubGlobal("CSS", { supports: () => true });

afterEach(() => {
  cleanup();
  mocks.cancel.mockClear();
  mocks.hookResult.sendMessage.mockClear();
  mocks.hookResult.isRunning = false;
  mocks.hookResult.isLoading = false;
});

const renderChat = () =>
  render(<AgentCodeChat project="p" sessionId="s" modelId="m" modelThinking={new Map()} />);

describe("AgentCodeChat cancel", () => {
  it("cancels the running turn when the loading submit button is clicked", () => {
    mocks.hookResult.isRunning = true;
    renderChat();
    fireEvent.click(screen.getByLabelText("Send message"));
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
  });

  it("does not cancel while the session is merely loading", () => {
    mocks.hookResult.isLoading = true;
    renderChat();
    fireEvent.click(screen.getByLabelText("Send message"));
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("sends selected skills as leading commands", () => {
    renderChat();
    fireEvent.click(screen.getByLabelText("Select skills"));
    fireEvent.click(screen.getByText("code-review"));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Review this change" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(mocks.hookResult.sendMessage).toHaveBeenCalledWith(
      "/skill:code-review\n\nReview this change",
    );
  });
});
