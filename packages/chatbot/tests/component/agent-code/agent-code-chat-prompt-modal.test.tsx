/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentCodeChat } from "@/components/code/agent-code-chat";

const mocks = vi.hoisted(() => ({
  promptsResult: {
    prompts: [
      {
        name: "review",
        description: "Review a session",
        inputs: [
          { name: "target_session", kind: "session", description: "Session", required: true },
        ],
      },
    ],
    sessions: [{ sessionId: "s1", label: "Session A" }],
    isLoading: false,
    error: null as string | null,
  },
}));

vi.mock("@/lib/features/code/hooks/use-coding-agent", () => ({
  useCodingAgent: () => ({
    messages: [],
    items: [],
    toolErrors: new Map(),
    turnFiles: new Map(),
    isRunning: false,
    isLoading: false,
    sendMessage: vi.fn(() => Promise.resolve()),
    status: { kind: "idle" },
    error: null,
    cancel: undefined as unknown as () => Promise<void>,
  }),
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
  useCodingAgentPrompts: () => mocks.promptsResult,
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

afterEach(() => cleanup());

describe("AgentCodeChat prompt modal", () => {
  it("passes the labeled sessions into the session select of the prompt form", async () => {
    render(<AgentCodeChat project="p" sessionId="s" modelId="m" modelThinking={new Map()} />);

    // El popup del dropdown se abre vía startTransition: usar queries
    // async (findBy*) en lugar de getBy* para esperar el flush.
    fireEvent.click(screen.getByLabelText("Select skills"));
    fireEvent.click(await screen.findByRole("tab", { name: "Prompts" }));
    fireEvent.click(await screen.findByText("review"));

    const select = (await screen.findByLabelText(/Session/)) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(Array.from(select.options).map((o) => o.textContent)).toContain(
      "Session A",
    );
  });
});
