/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentCodeChat } from "@/components/code/agent-code-chat";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";
import type { PendingComment } from "@/components/code/file-browser/types";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(() => Promise.resolve(true)),
  clearComments: vi.fn(),
  pendingComments: [] as PendingComment[],
  hookResult: {
    messages: [],
    items: [],
    toolErrors: new Map(),
    turnFiles: new Map(),
    isRunning: false,
    isLoading: false,
    sendMessage: undefined as unknown as () => Promise<boolean>,
    pendingQueues: { steering: [] as string[], followUp: [] as string[] },
    enqueueFollowUp: vi.fn(),
    status: { kind: "idle" } as AgentStatus,
    error: null as string | null,
    cancel: vi.fn(),
  },
}));
mocks.hookResult.sendMessage = mocks.sendMessage;

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
vi.mock("@/lib/features/code/hooks/use-coding-agent-prompts", () => ({
  useCodingAgentPrompts: () => ({ prompts: [], sessions: [], isLoading: false, error: null }),
}));
vi.mock("@/lib/features/code/hooks/use-coding-agent-session-thinking-level", () => ({
  useCodingAgentSessionThinkingLevel: () => ({ level: "low", setLevel: vi.fn() }),
}));
vi.mock("@/components/code/agent-conversation", () => ({
  AgentConversation: () => null,
}));
vi.mock("@/components/code/file-browser/file-browser-provider", () => ({
  useFileBrowser: () => ({
    state: { pendingComments: mocks.pendingComments },
    actions: { clearComments: mocks.clearComments },
  }),
}));

vi.stubGlobal("CSS", { supports: () => true });

afterEach(() => {
  cleanup();
  mocks.sendMessage.mockClear();
  mocks.clearComments.mockClear();
  mocks.pendingComments = [];
});

const modelThinking = new Map([
  ["m", { levels: ["low"] as ("low")[], defaultLevel: "low" as const }],
]);

describe("AgentCodeChat orphaned comment guard", () => {
  it("blocks submission and shows error if a response comment points to a missing message", async () => {
    mocks.pendingComments = [
      {
        id: "rc-orphan",
        kind: "response",
        messageId: "a-missing-id",
        turnNumber: 3,
        startLine: 1,
        endLine: 1,
        lineText: "some answer",
        text: "este comentario quedó huérfano",
        createdAt: 1,
      },
    ];

    render(
      <AgentCodeChat
        project="p"
        sessionId="s"
        modelId="m"
        modelThinking={modelThinking}
      />,
    );

    const textarea = screen.getByTestId("chat-input");
    fireEvent.change(textarea, { target: { value: "hola agente" } });

    const submitBtn = screen.getByRole("button", { name: "Send message" });
    fireEvent.click(submitBtn);

    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Response 3 is no longer available. Remove its orphaned comment before sending.",
      ),
    ).toBeDefined();
  });
});
