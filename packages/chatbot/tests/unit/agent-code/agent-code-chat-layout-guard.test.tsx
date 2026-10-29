/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { AgentCodeChatLayout } from "@/components/code/agent-code-chat-layout";

const mocks = vi.hoisted(() => ({
  onTurnRunningChange: null as null | ((running: boolean) => void),
}));

vi.mock("@/components/code/agent-code-chat", () => ({
  AgentCodeChat: (props: {
    onTurnRunningChange?: (running: boolean) => void;
  }) => {
    mocks.onTurnRunningChange = props.onTurnRunningChange ?? null;
    return null;
  },
}));
vi.mock("@/lib/features/code/hooks/use-coding-agent-session-model", () => ({
  useCodingAgentSessionModel: () => ({
    modelId: "model-a",
    setModelId: vi.fn(),
    isLoading: false,
  }),
}));
vi.mock("@/lib/features/code/hooks/use-create-coding-agent-session", () => ({
  useCreateCodingAgentSession: () => ({
    isCreatingSession: false,
    createNewSession: vi.fn(),
  }),
}));
vi.mock("@/components/code/file-browser/file-browser-provider", () => ({
  FileBrowserProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useFileBrowser: () => ({
    state: { pendingComments: [] },
    actions: {},
  }),
}));
vi.mock("@/components/code/file-browser/file-browser-entry-button", () => ({
  FileBrowserEntryButton: () => null,
}));
vi.mock("@/components/layout/header/logo", () => ({
  Logo: () => null,
}));
vi.mock("@/components/layout/header/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

afterEach(() => {
  cleanup();
  mocks.onTurnRunningChange = null;
});

const renderLayout = () =>
  render(
    <AgentCodeChatLayout
      project="p"
      sessionId="s"
      availableModels={["model-a", "model-b"]}
      modelThinking={new Map()}
    />,
  );

describe("AgentCodeChatLayout model guard (ticket 03)", () => {
  it("locks the model picker while a turn runs and unlocks it after", async () => {
    renderLayout();
    // (No accessible-name filter: something above the trigger defeats the
    // accessible-name computation in jsdom; textContent is unambiguous.)
    const picker = () => screen.getByRole("combobox");
    expect(picker().textContent).toBe("model-a");
    expect((picker() as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      mocks.onTurnRunningChange?.(true);
    });
    expect((picker() as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      mocks.onTurnRunningChange?.(false);
    });
    expect((picker() as HTMLButtonElement).disabled).toBe(false);
  });

  it("forwards the turn state without breaking the send path", async () => {
    renderLayout();
    expect(mocks.onTurnRunningChange).not.toBeNull();
    fireEvent.click(screen.getByLabelText("New coding agent session"));
  });
});
