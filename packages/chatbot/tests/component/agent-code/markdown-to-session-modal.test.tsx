/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MarkdownToSessionModal } from "@/components/code/markdown-to-session-modal";

const mocks = vi.hoisted(() => ({
  createCodingAgentSession: vi.fn(),
  push: vi.fn(),
  modelId: "Deepseek v4 Pro",
  promptMock: [
    {
      name: "summarize",
      description: "Summarize a document",
      inputs: [
        {
          name: "length",
          kind: "string",
          description: "Length",
          required: false,
          default: "short",
        },
      ],
    },
  ] as Array<{
    name: string;
    description: string;
    inputs: Array<{
      name: string;
      kind: string;
      description: string;
      required: boolean;
      default?: string;
    }>;
  }>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/features/code/actions", () => ({
  createCodingAgentSession: (
    project: string,
    modelId?: string,
    initialPrompt?: string,
  ) => mocks.createCodingAgentSession(project, modelId, initialPrompt),
}));

vi.mock("@/lib/features/code/hooks/use-coding-agent-session-model", () => ({
  useCodingAgentSessionModel: ({ fallbackModelId }: { fallbackModelId: string }) => ({
    modelId: mocks.modelId || fallbackModelId || null,
    setModelId: vi.fn(),
    isLoading: !(mocks.modelId || fallbackModelId),
  }),
}));

vi.mock("@/lib/features/code/hooks/use-coding-agent-skills", () => ({
  useCodingAgentSkills: () => ({
    skills: [{ name: "code-review", description: "Review code changes" }],
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/lib/features/code/hooks/use-coding-agent-prompts", () => ({
  useCodingAgentPrompts: () => ({
    prompts: mocks.promptMock,
    sessions: [],
    isLoading: false,
    error: null,
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

// jsdom lacks the CSS global the Textarea autosize effect probes.
vi.stubGlobal("CSS", { supports: () => true });
// Models fetch from /api/agent/code/models.
vi.stubGlobal("fetch", () =>
  Promise.resolve({
    ok: true,
    json: async () => ({ models: [{ id: "Deepseek v4 Pro", levels: [] }] }),
  }),
);

afterEach(() => {
  cleanup();
  mocks.createCodingAgentSession.mockReset();
  mocks.push.mockReset();
});

const renderModal = (onClose?: () => void) =>
  render(
    <MarkdownToSessionModal
      path="docs/guide.md"
      content="# Guide body"
      project="p"
      sessionId="s"
      onClose={onClose ?? (() => {})}
    />,
  );

describe("MarkdownToSessionModal", () => {
  it("shows the filename and an empty prefix textarea", () => {
    renderModal();
    expect(
      screen.getByRole("dialog", { name: "New session from guide.md" }),
    ).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("disables send with no prefix", () => {
    renderModal();
    // toBeDisabled is a jest-dom matcher not registered in this repo; use native property.
    expect(screen.getByLabelText("Send message")).toHaveProperty("disabled", true);
  });

  it("sends prefix + markdown body and navigates to the new session", async () => {
    mocks.createCodingAgentSession.mockResolvedValue({ sessionId: "new-id" });
    renderModal();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Review this" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));
    await waitFor(() =>
      expect(mocks.createCodingAgentSession).toHaveBeenCalledWith(
        "p",
        "Deepseek v4 Pro",
        "Review this\n\n# Guide body",
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/agent/code/p/new-id");
  });

  it("prepends selected skills to the prefix", async () => {
    mocks.createCodingAgentSession.mockResolvedValue({ sessionId: "new-id" });
    renderModal();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Do it" },
    });
    fireEvent.click(screen.getByLabelText("Select skills"));
    fireEvent.click(screen.getAllByText("code-review")[0]!);
    fireEvent.click(screen.getByLabelText("Send message"));
    await waitFor(() =>
      expect(mocks.createCodingAgentSession).toHaveBeenCalledWith(
        "p",
        "Deepseek v4 Pro",
        "/skill:code-review\n\nDo it\n\n# Guide body",
      ),
    );
  });

  it("opens PromptFormModal without closing the main modal when a prompt template is selected", async () => {
    const onClose = vi.fn();
    renderModal(onClose);

    // Open the skills control dropdown.
    fireEvent.click(screen.getByLabelText("Select skills"));

    // Switch to the Prompts tab.
    fireEvent.click(screen.getByRole("tab", { name: "Prompts" }));

    // Select the "summarize" prompt template.
    fireEvent.click(screen.getByText("summarize"));

    // PromptFormModal should be visible (its heading contains the prompt name).
    await waitFor(() => {
      expect(screen.getByText("summarize", { selector: "h2" })).toBeTruthy();
    });

    // Click inside the PromptFormModal — this must NOT close the main modal.
    // Before the fix, the click bubbled to the overlay's onClick={onClose}.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "New session from guide.md" }),
    ).toBeTruthy();
  });
});
