/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";
import type { AgentItem } from "@/lib/features/code/types";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(() => Promise.resolve()),
  sendMessage: vi.fn(() => Promise.resolve(true)),
  enqueueFollowUp: vi.fn(() => Promise.resolve()),
  clearQueue: vi.fn(() => Promise.resolve()),
  promoteToSteering: vi.fn(() => Promise.resolve()),
  clearComments: vi.fn(),
  conversation: vi.fn((_props: Record<string, unknown>) => null),
  hookResult: {} as Record<string, unknown>,
}));

const USER_MESSAGE = {
  id: "u1",
  role: "user" as const,
  content: "/skill:archify original question",
};
const ASSISTANT_MESSAGE = { id: "a1", role: "assistant" as const, content: "answer" };

mocks.hookResult.messages = [USER_MESSAGE, ASSISTANT_MESSAGE];
mocks.hookResult.items = [
  { kind: "user", message: USER_MESSAGE },
  { kind: "assistant", message: ASSISTANT_MESSAGE, toolGroups: [] },
] satisfies AgentItem[];
mocks.hookResult.toolErrors = new Map();
mocks.hookResult.turnFiles = new Map();
mocks.hookResult.isRunning = false;
mocks.hookResult.isLoading = false;
mocks.hookResult.sendMessage = mocks.sendMessage;
mocks.hookResult.pendingQueues = { steering: [], followUp: [] };
mocks.hookResult.enqueueFollowUp = mocks.enqueueFollowUp;
mocks.hookResult.clearQueue = mocks.clearQueue;
mocks.hookResult.promoteToSteering = mocks.promoteToSteering;
mocks.hookResult.status = { kind: "idle" } as AgentStatus;
mocks.hookResult.error = null;
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
  useCodingAgentSkills: () => ({ skills: [], isLoading: false, error: null }),
}));
vi.mock("@/components/code/agent-conversation", () => ({
  AgentConversation: (props: Record<string, unknown>) => {
    mocks.conversation(props);
    return null;
  },
}));
vi.mock("@/components/code/file-browser/file-browser-provider", () => ({
  useFileBrowser: () => ({
    state: { pendingComments: [] },
    actions: { clearComments: mocks.clearComments },
  }),
}));
vi.mock("@/components/code/file-browser/pending-comments-bar", () => ({
  PendingCommentsBar: () => null,
}));

// jsdom in this setup does not expose the CSS global the Textarea autosize
// effect probes.
vi.stubGlobal("CSS", { supports: () => true });

const { AgentCodeChat } = await import("@/components/code/agent-code-chat");

const modelThinking = new Map([
  ["m", { levels: ["low"] as ("low")[], defaultLevel: "low" as const }],
]);

const renderChat = () =>
  render(
    <AgentCodeChat project="p" sessionId="s" modelId="m" modelThinking={modelThinking} />,
  );

const textarea = () => screen.getByTestId("chat-input") as HTMLTextAreaElement;
const submitForm = () => {
  const form = textarea().closest("form");
  if (!form) throw new Error("composer form not found");
  fireEvent.submit(form);
};
/** The transcript is stubbed; the pencil is one of the props it receives. */
const clickPencil = (messageId: string) => {
  const props = mocks.conversation.mock.lastCall?.[0] as {
    onEditUserMessage?: (id: string) => void;
  };
  if (!props?.onEditUserMessage) throw new Error("transcript has no pencil");
  act(() => props.onEditUserMessage?.(messageId));
};

beforeEach(() => {
  mocks.sendMessage.mockClear();
  mocks.conversation.mockClear();
});

afterEach(cleanup);

describe("AgentCodeChat Message Edit", () => {
  it("loads the edited Message and its skill chips into the composer", () => {
    renderChat();

    clickPencil("u1");

    expect(textarea().value).toBe("original question");
    expect(screen.getByLabelText("Selected skills").textContent).toContain("archify");
    expect(screen.getByTestId("edit-message-banner").textContent).toContain(
      "1 later message will be discarded on send",
    );
  });

  it("sends the branch with the submit and leaves the edit mode", async () => {
    renderChat();
    clickPencil("u1");

    submitForm();

    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalled());
    expect(mocks.sendMessage).toHaveBeenCalledWith("/skill:archify\n\noriginal question", {
      branchFromMessageId: "u1",
    });
    expect(screen.queryByTestId("edit-message-banner")).toBeNull();
  });

  it("parks the current draft while editing and puts it back on cancel", () => {
    renderChat();
    fireEvent.change(textarea(), { target: { value: "a draft I was writing" } });

    clickPencil("u1");
    expect(textarea().value).toBe("original question");

    fireEvent.click(screen.getByLabelText("Cancel edit"));

    expect(textarea().value).toBe("a draft I was writing");
    expect(screen.queryByTestId("edit-message-banner")).toBeNull();
  });

  it("keeps text typed while editing instead of clobbering it with the parked draft", () => {
    renderChat();
    fireEvent.change(textarea(), { target: { value: "draft before editing" } });
    clickPencil("u1");

    // Retyped during the edit: cancelling must not discard it.
    fireEvent.change(textarea(), { target: { value: "typed while editing" } });
    fireEvent.click(screen.getByLabelText("Cancel edit"));

    expect(textarea().value).toBe("typed while editing");
    expect(screen.queryByTestId("edit-message-banner")).toBeNull();
  });

  it("closes the edit on Escape, keeping the parked draft", () => {
    renderChat();
    fireEvent.change(textarea(), { target: { value: "draft" } });
    clickPencil("u1");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(textarea().value).toBe("draft");
    expect(screen.queryByTestId("edit-message-banner")).toBeNull();
  });

  it("offers no pencil while a turn is running", () => {
    mocks.hookResult.isRunning = true;
    try {
      renderChat();
      const props = mocks.conversation.mock.lastCall?.[0] as {
        onEditUserMessage?: unknown;
      };
      expect(props.onEditUserMessage).toBeUndefined();
    } finally {
      mocks.hookResult.isRunning = false;
    }
  });
});
