/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentCodeChat } from "@/components/code/agent-code-chat";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn((): Promise<string | null> => Promise.resolve(null)),
  sendMessage: vi.fn(() => Promise.resolve(true)),
  enqueueFollowUp: vi.fn(() => Promise.resolve()),
  clearComments: vi.fn(),
  toggleSkill: undefined as unknown as (name: string) => void,
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
    status: { kind: "thinking" } as AgentStatus,
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
    skills: [{ name: "review", description: "Review code" }],
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
// Test double exposing the toggle: the real picker needs dropdown
// interaction, but the guard only cares about the armed selection.
vi.mock("@/components/code/skills-control", () => ({
  SkillsControl: ({
    onToggle,
  }: {
    onToggle: (name: string) => void;
  }) => {
    mocks.toggleSkill = onToggle;
    return (
      <button type="button" aria-label="Toggle test skill" onClick={() => onToggle("review")}>
        toggle skill
      </button>
    );
  },
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
  mocks.sendMessage.mockImplementation(() => Promise.resolve(true));
  mocks.enqueueFollowUp.mockImplementation(() => Promise.resolve());
  mocks.hookResult.isRunning = true;
  mocks.hookResult.isLoading = false;
  mocks.hookResult.pendingMessage = null;
  mocks.hookResult.error = null;
});

const modelThinking = new Map([
  ["m", { levels: ["low"] as ("low")[], defaultLevel: "low" as const }],
]);

const renderChat = () =>
  render(
    <AgentCodeChat project="p" sessionId="s" modelId="m" modelThinking={modelThinking} />,
  );

const submitForm = () => {
  const form = screen.getByTestId("chat-input").closest("form");
  if (!form) throw new Error("composer form not found");
  fireEvent.submit(form);
};

describe("AgentCodeChat mid-turn submit validation (US8)", () => {
  it("blocks a mid-turn submit with an armed skill: precise error, draft preserved, worker untouched", async () => {
    renderChat();
    fireEvent.click(screen.getByLabelText("Toggle test skill"));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "steer a bit" },
    });
    submitForm();

    await vi.waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /skills cannot be queued.*plain text only/i,
      );
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.enqueueFollowUp).not.toHaveBeenCalled();
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).value).toBe(
      "steer a bit",
    );
  });

  it("blocks a mid-turn submit with pending file comments: precise error, draft preserved", async () => {
    renderChat();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "steer a bit" },
    });
    submitForm();

    await vi.waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /file comments cannot be queued.*plain text only/i,
      );
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).value).toBe(
      "steer a bit",
    );
  });

  it("blocks the follow-up button with an armed skill instead of silently enqueueing the bare text", async () => {
    renderChat();
    fireEvent.click(screen.getByLabelText("Toggle test skill"));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "steer a bit" },
    });
    fireEvent.click(screen.getByLabelText("Queue follow-up"));

    await vi.waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /skills cannot be queued.*plain text only/i,
      );
    });
    expect(mocks.enqueueFollowUp).not.toHaveBeenCalled();
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).value).toBe(
      "steer a bit",
    );
  });
});
