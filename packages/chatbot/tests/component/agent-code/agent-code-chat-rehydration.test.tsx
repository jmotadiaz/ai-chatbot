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
  hookResult: {
    messages: [],
    items: [],
    toolErrors: new Map(),
    turnFiles: new Map(),
    isRunning: true,
    isLoading: false,
    sendMessage: undefined as unknown as () => Promise<boolean>,
    pendingMessage: null as string | null,
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
  mocks.sendMessage.mockClear();
  mocks.sendMessage.mockImplementation(() => Promise.resolve(true));
  mocks.hookResult.isRunning = true;
  mocks.hookResult.pendingMessage = null;
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
