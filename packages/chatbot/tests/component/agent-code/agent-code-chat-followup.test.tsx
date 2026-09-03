/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentCodeChat } from "@/components/code/agent-code-chat";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(() => Promise.resolve()),
  sendMessage: vi.fn(() => Promise.resolve(true)),
  enqueueFollowUp: vi.fn(() => Promise.resolve()),
  hookResult: {
    messages: [],
    items: [],
    toolErrors: new Map(),
    turnFiles: new Map(),
    isRunning: false,
    isLoading: false,
    sendMessage: undefined as unknown as () => Promise<boolean>,
    pendingMessage: null as string | null,
    enqueueFollowUp: undefined as unknown as (text: string) => Promise<void>,
    status: { kind: "idle" } as AgentStatus,
    error: null as string | null,
    cancel: undefined as unknown as () => Promise<void>,
  },
}));
mocks.hookResult.sendMessage = mocks.sendMessage;
mocks.hookResult.enqueueFollowUp = mocks.enqueueFollowUp;
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
    skills: [],
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
  mocks.enqueueFollowUp.mockClear();
  mocks.sendMessage.mockClear();
  mocks.enqueueFollowUp.mockImplementation(() => Promise.resolve());
  mocks.hookResult.isRunning = false;
  mocks.hookResult.isLoading = false;
  mocks.hookResult.pendingMessage = null;
});

const renderChat = () =>
  render(<AgentCodeChat project="p" sessionId="s" modelId="m" modelThinking={new Map()} />);

describe("AgentCodeChat follow-up", () => {
  it("hides the follow-up button while no turn is running", () => {
    mocks.hookResult.isRunning = false;
    renderChat();
    expect(screen.queryByLabelText("Queue follow-up")).toBeNull();
  });

  it("shows the follow-up button during an active turn", () => {
    mocks.hookResult.isRunning = true;
    renderChat();
    expect(screen.getByLabelText("Queue follow-up")).toBeDefined();
  });

  it("enqueues the typed text and clears the textarea on success", async () => {
    mocks.hookResult.isRunning = true;
    renderChat();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "also fix the typo" },
    });
    fireEvent.click(screen.getByLabelText("Queue follow-up"));

    await vi.waitFor(() => {
      expect(mocks.enqueueFollowUp).toHaveBeenCalledWith("also fix the typo");
    });
    await vi.waitFor(() => {
      // No jest-dom in this repo; read the native property.
      expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).value).toBe("");
    });
  });

  it("keeps the typed text when enqueueing fails", async () => {
    mocks.hookResult.isRunning = true;
    mocks.enqueueFollowUp.mockImplementation(() => Promise.reject(new Error("offline")));
    renderChat();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "also fix the typo" },
    });
    fireEvent.click(screen.getByLabelText("Queue follow-up"));

    await vi.waitFor(() => {
      expect(mocks.enqueueFollowUp).toHaveBeenCalledTimes(1);
    });
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).value).toBe(
      "also fix the typo",
    );
  });

  it("shows the pending chip above the textarea", () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingMessage = "also fix the typo";
    renderChat();
    const chip = screen.getByTestId("followup-chip");
    expect(chip.textContent).toContain("also fix the typo");
  });

  it("hides the chip when nothing is pending", () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingMessage = null;
    renderChat();
    expect(screen.queryByTestId("followup-chip")).toBeNull();
  });
});
