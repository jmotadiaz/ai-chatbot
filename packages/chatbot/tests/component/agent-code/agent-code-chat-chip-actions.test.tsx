/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentCodeChat } from "@/components/code/agent-code-chat";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(() => Promise.resolve()),
  sendMessage: vi.fn(() => Promise.resolve()),
  enqueueFollowUp: vi.fn(() => Promise.resolve()),
  clearQueue: vi.fn(() => Promise.resolve()),
  promoteToSteering: vi.fn(() => Promise.resolve()),
  hookResult: {
    messages: [],
    items: [],
    toolErrors: new Map(),
    turnFiles: new Map(),
    isRunning: false,
    isLoading: false,
    sendMessage: undefined as unknown as () => Promise<void>,
    pendingFollowUp: null as string | null,
    enqueueFollowUp: undefined as unknown as (text: string) => Promise<void>,
    clearQueue: undefined as unknown as () => Promise<void>,
    promoteToSteering: undefined as unknown as (text: string) => Promise<void>,
    status: { kind: "idle" } as AgentStatus,
    error: null as string | null,
    cancel: undefined as unknown as () => Promise<void>,
  },
}));
mocks.hookResult.sendMessage = mocks.sendMessage;
mocks.hookResult.enqueueFollowUp = mocks.enqueueFollowUp;
mocks.hookResult.clearQueue = mocks.clearQueue;
mocks.hookResult.promoteToSteering = mocks.promoteToSteering;
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
  for (const fn of [
    mocks.enqueueFollowUp,
    mocks.clearQueue,
    mocks.promoteToSteering,
    mocks.sendMessage,
  ]) {
    fn.mockClear();
    fn.mockImplementation(() => Promise.resolve());
  }
  mocks.hookResult.isRunning = false;
  mocks.hookResult.isLoading = false;
  mocks.hookResult.pendingFollowUp = null;
});

const renderChat = () =>
  render(<AgentCodeChat project="p" sessionId="s" modelId="m" modelThinking={new Map()} />);

describe("AgentCodeChat chip actions (ticket 02)", () => {
  it("shows the three chip actions while a message is pending", () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingFollowUp = "also fix the typo";
    renderChat();
    expect(screen.getByTestId("followup-chip").textContent).toContain("also fix the typo");
    expect(screen.getByLabelText("Edit pending follow-up")).toBeDefined();
    expect(screen.getByLabelText("Discard pending follow-up")).toBeDefined();
    expect(screen.getByLabelText("Promote to steering")).toBeDefined();
  });

  it("hides the chip actions when nothing is pending", () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingFollowUp = null;
    renderChat();
    expect(screen.queryByTestId("followup-chip")).toBeNull();
    expect(screen.queryByLabelText("Edit pending follow-up")).toBeNull();
    expect(screen.queryByLabelText("Discard pending follow-up")).toBeNull();
    expect(screen.queryByLabelText("Promote to steering")).toBeNull();
  });

  it("edit returns the pending text to the textarea for rework", async () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingFollowUp = "also fix the typo";
    renderChat();
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).value).toBe("");

    fireEvent.click(screen.getByLabelText("Edit pending follow-up"));

    await vi.waitFor(() => {
      expect(mocks.clearQueue).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      // Never auto-reenqueued: the text waits in the textarea for one more
      // explicit send, and no steering call fires.
      expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).value).toBe(
        "also fix the typo",
      );
    });
    expect(mocks.promoteToSteering).not.toHaveBeenCalled();
  });

  it("discard clears the queue without executing and without touching the draft", async () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingFollowUp = "also fix the typo";
    renderChat();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "fresh idea" },
    });

    fireEvent.click(screen.getByLabelText("Discard pending follow-up"));

    await vi.waitFor(() => {
      expect(mocks.clearQueue).toHaveBeenCalledTimes(1);
    });
    expect(mocks.promoteToSteering).not.toHaveBeenCalled();
    // The textarea draft is untouched: discard drops the chip, not the draft.
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).value).toBe("fresh idea");
  });

  it("promote sends the pending text to steering exactly once", async () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingFollowUp = "also fix the typo";
    renderChat();

    fireEvent.click(screen.getByLabelText("Promote to steering"));

    await vi.waitFor(() => {
      expect(mocks.promoteToSteering).toHaveBeenCalledTimes(1);
    });
    expect(mocks.promoteToSteering).toHaveBeenCalledWith("also fix the typo");
    expect(mocks.clearQueue).not.toHaveBeenCalled();
  });
});
