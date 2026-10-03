/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentCodeChat } from "@/components/code/agent-code-chat";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(() => Promise.resolve(null)),
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
    isRunning: true,
    isLoading: false,
    sendMessage: undefined as unknown as () => Promise<boolean>,
    pendingQueues: { steering: [] as string[], followUp: [] as string[] },
    enqueueFollowUp: undefined as unknown as (text: string) => Promise<void>,
    clearQueue: undefined as unknown as () => Promise<void>,
    promoteToSteering: undefined as unknown as (text: string) => Promise<void>,
    status: { kind: "thinking" } as AgentStatus,
    error: null as string | null,
    cancel: undefined as unknown as () => Promise<string | null>,
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
  // Spy: the steering bubble is a prop derived from the rehydrated queues.
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
  mocks.sendMessage.mockClear();
  mocks.sendMessage.mockImplementation(() => Promise.resolve(true));
  mocks.hookResult.isRunning = true;
  mocks.hookResult.pendingQueues = { steering: [], followUp: [] };
  mocks.conversation.mockClear();
  mocks.hookResult.error = null;
});

const renderChat = () =>
  render(<AgentCodeChat project="p" sessionId="s" modelId="m" modelThinking={new Map()} />);

const submitForm = () => {
  const form = screen.getByTestId("chat-input").closest("form");
  if (!form) throw new Error("composer form not found");
  fireEvent.submit(form);
};

describe("AgentCodeChat mid-turn submit edge cases (ticket 04)", () => {
  it("keeps the draft and shows the banner error when the worker rejects the send", async () => {
    mocks.sendMessage.mockImplementation(() => Promise.resolve(false));
    mocks.hookResult.error =
      "Failed to queue follow-up: worker unreachable (Failed to fetch)";
    renderChat();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "do not lose me" },
    });
    submitForm();

    await vi.waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledWith("do not lose me");
    });
    // The text survives in the textarea and the failure is visible.
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).value).toBe(
      "do not lose me",
    );
    expect(screen.getByRole("alert").textContent).toMatch(/worker unreachable/i);
  });

  it("clears the composer once the worker accepts the mid-turn send", async () => {
    mocks.sendMessage.mockImplementation(() => Promise.resolve(true));
    renderChat();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "steer a bit" },
    });
    submitForm();

    await vi.waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledWith("steer a bit");
    });
    await vi.waitFor(() => {
      expect(
        (screen.getByTestId("chat-input") as HTMLTextAreaElement).value,
      ).toBe("");
    });
  });
});

describe("AgentCodeChat steering bubble after a reload (ticket 03)", () => {
  it("shows the steering rehydrated from snapshot.pending and no chip", () => {
    // The hook already rehydrates `snapshot.pending` into the raw queues
    // (ticket 01): a steering-only payload lands in `steering`, and the
    // transcript bubble is rendered from there on the first paint.
    mocks.hookResult.pendingQueues = {
      steering: ["steered before reload"],
      followUp: [],
    };
    renderChat();

    expect(mocks.conversation.mock.calls.at(-1)?.[0]).toMatchObject({
      steeringPending: "steered before reload",
    });
    expect(screen.queryByTestId("followup-chip")).toBeNull();
    // The composer stays locked to cancel while the queue drains.
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).disabled).toBe(
      true,
    );
  });

  it("shows a rehydrated follow-up as the chip and no bubble", () => {
    mocks.hookResult.pendingQueues = {
      steering: [],
      followUp: ["queued before reload"],
    };
    renderChat();

    expect(screen.getByTestId("followup-chip").textContent).toContain(
      "queued before reload",
    );
    expect(mocks.conversation.mock.calls.at(-1)?.[0]).toMatchObject({
      steeringPending: null,
    });
  });
});
