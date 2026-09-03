/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentCodeChat } from "@/components/code/agent-code-chat";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn((): Promise<string | null> => Promise.resolve(null)),
  sendMessage: vi.fn(() => Promise.resolve()),
  enqueueFollowUp: vi.fn(() => Promise.resolve()),
  clearComments: vi.fn(),
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
    status: { kind: "idle" } as AgentStatus,
    error: null as string | null,
    cancel: undefined as unknown as () => Promise<string | null>,
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
vi.mock("@/lib/features/code/hooks/use-coding-agent-prompts", () => ({
  useCodingAgentPrompts: () => ({
    prompts: [],
    sessions: [],
    isLoading: false,
    error: null,
  }),
}));
vi.mock("@/lib/features/code/hooks/use-coding-agent-session-thinking-level", () => ({
  useCodingAgentSessionThinkingLevel: () => ({
    level: "low",
    setLevel: vi.fn(),
  }),
}));
vi.mock("@/components/code/agent-conversation", () => ({
  AgentConversation: () => null,
}));
vi.mock("@/components/code/file-browser/file-browser-provider", () => ({
  useFileBrowser: () => ({
    state: {
      pendingComments: [
        {
          id: "c1",
          file: "src/a.ts",
          startLine: 3,
          endLine: 3,
          lineText: "const x = 1;",
          text: "fix this",
          createdAt: 1,
        },
      ],
    },
    actions: { clearComments: mocks.clearComments },
  }),
}));

// jsdom in this setup does not expose the CSS global the Textarea autosize
// effect probes.
vi.stubGlobal("CSS", { supports: () => true });

afterEach(() => {
  cleanup();
  mocks.cancel.mockClear();
  mocks.sendMessage.mockClear();
  mocks.enqueueFollowUp.mockClear();
  mocks.clearComments.mockClear();
  mocks.cancel.mockImplementation((): Promise<string | null> => Promise.resolve(null));
  mocks.hookResult.isRunning = false;
  mocks.hookResult.isLoading = false;
  mocks.hookResult.pendingFollowUp = null;
});

const modelThinking = new Map([
  ["m", { levels: ["low", "high"] as ("low" | "high")[], defaultLevel: "low" as const }],
]);

const renderChat = () =>
  render(
    <AgentCodeChat project="p" sessionId="s" modelId="m" modelThinking={modelThinking} />,
  );

const isDisabled = (el: Element | null) =>
  el instanceof HTMLButtonElement ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLInputElement
    ? el.disabled
    : el?.hasAttribute("disabled") ?? false;

const expectDisabled = (el: Element | null) => {
  expect(isDisabled(el)).toBe(true);
};
const expectEnabled = (el: Element | null) => {
  expect(isDisabled(el)).toBe(false);
};

describe("AgentCodeChat composer guards (ticket 03)", () => {
  it("locks turn-scoped controls while a turn runs, without chip", () => {
    mocks.hookResult.isRunning = true;
    renderChat();

    // Turn config and non-text sources do not apply until the next turn.
    expectDisabled(screen.getByLabelText("Attach files"));
    expectDisabled(screen.getByLabelText("Select skills"));
    expectDisabled(screen.getByLabelText(/Reasoning effort/));
    expectDisabled(
      screen.getByLabelText("Remove comment on src/a.ts line 3"),
    );
    // Composing plain text for the follow-up stays possible.
    expectEnabled(screen.getByTestId("chat-input"));
    // Empty draft: nothing to queue yet. With text, the follow-up path
    // stays open while the turn runs.
    expectDisabled(screen.getByLabelText("Queue follow-up"));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "steer a bit" },
    });
    expectEnabled(screen.getByLabelText("Queue follow-up"));
  });

  it("leaves every scope enabled while idle", () => {
    mocks.hookResult.isRunning = false;
    renderChat();

    expectEnabled(screen.getByLabelText("Attach files"));
    expectEnabled(screen.getByLabelText("Select skills"));
    expectEnabled(screen.getByLabelText(/Reasoning effort/));
    expectEnabled(
      screen.getByLabelText("Remove comment on src/a.ts line 3"),
    );
    expectEnabled(screen.getByTestId("chat-input"));
  });

  it("with a pending chip only chip-plus-cancel stay alive", () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingFollowUp = "also fix the typo";
    renderChat();

    // The chip itself survives (ticket 02 owns its actions).
    expect(screen.getByTestId("followup-chip")).toBeDefined();
    // Everything else locks: textarea, follow-up and the idle send path.
    expectDisabled(screen.getByTestId("chat-input"));
    expectDisabled(screen.getByLabelText("Queue follow-up"));
    expectDisabled(screen.getByLabelText("Attach files"));
    expectDisabled(screen.getByLabelText("Select skills"));
    expectDisabled(screen.getByLabelText(/Reasoning effort/));
    // Cancel stays alive: in loading mode ChatControl ignores `disabled`,
    // so the spinner keeps its abort handler.
    const cancel = screen.getByLabelText("Send message");
    expect(cancel).toBeDefined();
    expect(cancel.getAttribute("disabled")).toBeNull();
  });

  it("idle send opens a new turn through sendMessage, never the queue", async () => {
    mocks.hookResult.isRunning = false;
    renderChat();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "start fresh work" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    await vi.waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });
    expect(mocks.enqueueFollowUp).not.toHaveBeenCalled();
  });

  it("aborting with a pending chip returns its text to the textarea as a draft", async () => {
    mocks.hookResult.isRunning = true;
    mocks.hookResult.pendingFollowUp = "also fix the typo";
    mocks.cancel.mockImplementation(() => Promise.resolve("also fix the typo"));
    renderChat();

    fireEvent.click(screen.getByLabelText("Send message"));

    await vi.waitFor(() => {
      expect(mocks.cancel).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).value).toBe(
        "also fix the typo",
      );
    });
  });
});
