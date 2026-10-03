/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentCodeChat } from "@/components/code/agent-code-chat";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(() => Promise.resolve()),
  sendMessage: vi.fn(() => Promise.resolve(true)),
  enqueueFollowUp: vi.fn(() => Promise.resolve()),
  clearQueue: vi.fn(() => Promise.resolve()),
  promoteToSteering: vi.fn(() => Promise.resolve()),
  conversation: vi.fn((_props: unknown) => null),
  hookResult: {
    messages: [],
    items: [],
    toolErrors: new Map(),
    turnFiles: new Map(),
    isRunning: false,
    isLoading: false,
    sendMessage: undefined as unknown as () => Promise<boolean>,
    pendingQueues: { steering: [] as string[], followUp: [] as string[] },
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
  // Spy instead of a null stub: the armed steering text is handed to the
  // transcript as a prop, so the bubble is asserted from these calls.
  AgentConversation: (props: unknown) => {
    mocks.conversation(props);
    return null;
  },
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
  ]) {
    fn.mockClear();
    fn.mockImplementation(() => Promise.resolve());
  }
  mocks.sendMessage.mockClear();
  mocks.sendMessage.mockImplementation(() => Promise.resolve(true));
  mocks.hookResult.isRunning = false;
  mocks.hookResult.isLoading = false;
  mocks.hookResult.pendingQueues = { steering: [], followUp: [] };
  mocks.conversation.mockClear();
});

const renderChat = () =>
  render(<AgentCodeChat project="p" sessionId="s" modelId="m" modelThinking={new Map()} />);

// ChatControl renders a real <button>, but the disabled state must hold for
// either shape it can take.
const expectDisabled = (label: string) => {
  const control = screen.getByLabelText(label);
  expect(
    control instanceof HTMLButtonElement
      ? control.disabled
      : control.hasAttribute("disabled"),
  ).toBe(true);
};

describe("AgentCodeChat chip actions", () => {
  it("shows the three chip actions while a message is pending", () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingQueues = { steering: [], followUp: ["also fix the typo"] };
    renderChat();
    expect(screen.getByTestId("followup-chip").textContent).toContain("also fix the typo");
    expect(screen.getByLabelText("Edit pending follow-up")).toBeDefined();
    expect(screen.getByLabelText("Discard pending follow-up")).toBeDefined();
    expect(screen.getByLabelText("Promote to steering")).toBeDefined();
    // Exclusive dispatch: an armed follow-up is never a transcript bubble.
    expect(mocks.conversation.mock.calls.at(-1)?.[0]).toMatchObject({
      steeringPending: null,
    });
  });

  it("hides the chip actions when nothing is pending", () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingQueues = { steering: [], followUp: [] };
    renderChat();
    expect(screen.queryByTestId("followup-chip")).toBeNull();
    expect(screen.queryByLabelText("Edit pending follow-up")).toBeNull();
    expect(screen.queryByLabelText("Discard pending follow-up")).toBeNull();
    expect(screen.queryByLabelText("Promote to steering")).toBeNull();
  });

  it("edit returns the pending text to the textarea for rework", async () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingQueues = { steering: [], followUp: ["also fix the typo"] };
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
    mocks.hookResult.pendingQueues = { steering: [], followUp: ["also fix the typo"] };
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
    mocks.hookResult.pendingQueues = { steering: [], followUp: ["also fix the typo"] };
    renderChat();

    fireEvent.click(screen.getByLabelText("Promote to steering"));

    await vi.waitFor(() => {
      expect(mocks.promoteToSteering).toHaveBeenCalledTimes(1);
    });
    expect(mocks.promoteToSteering).toHaveBeenCalledWith("also fix the typo");
    expect(mocks.clearQueue).not.toHaveBeenCalled();
  });
});

describe("AgentCodeChat exclusive dispatch: steering as a transcript bubble", () => {
  it("shows the steering text as a bubble, no chip, and keeps the composer locked", () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingQueues = { steering: ["steered text"], followUp: [] };
    renderChat();

    // A promoted message is already sent: it lives in the transcript as a
    // read-only bubble, and the textarea area carries no chip at all.
    expect(mocks.conversation.mock.calls.at(-1)?.[0]).toMatchObject({
      steeringPending: "steered text",
    });
    expect(screen.queryByTestId("followup-chip")).toBeNull();
    expect(screen.queryByLabelText("Edit pending follow-up")).toBeNull();
    expect(screen.queryByLabelText("Discard pending follow-up")).toBeNull();
    expect(screen.queryByLabelText("Promote to steering")).toBeNull();

    // Everything but cancel stays locked, with the bubble as the visible
    // signal of that lock.
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).disabled).toBe(true);
    expectDisabled("Queue follow-up");
    expectDisabled("Refine prompt");
  });

  it("drops the bubble with no state left once delivery empties the queue", () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingQueues = { steering: ["steered text"], followUp: [] };
    const { rerender } = renderChat();
    expect(mocks.conversation.mock.calls.at(-1)?.[0]).toMatchObject({
      steeringPending: "steered text",
    });

    // The worker's post-delivery `queue_update` carries empty queues: no
    // "delivered" phase to transition out of, chip or bubble alike.
    mocks.hookResult.pendingQueues = { steering: [], followUp: [] };
    rerender(
      <AgentCodeChat project="p" sessionId="s" modelId="m" modelThinking={new Map()} />,
    );

    expect(mocks.conversation.mock.calls.at(-1)?.[0]).toMatchObject({
      steeringPending: null,
    });
    expect(screen.queryByTestId("followup-chip")).toBeNull();
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).disabled).toBe(false);
  });
});
