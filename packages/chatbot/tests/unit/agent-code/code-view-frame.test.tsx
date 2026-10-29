/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  CodeViewFrame,
  type DisplayLine,
  type LoadState,
} from "@/components/code/file-browser/code-view-frame";
import { FileBrowserProvider } from "@/components/code/file-browser/file-browser-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/features/code/actions", () => ({
  createCodingAgentSession: vi.fn(),
}));

vi.mock("@/lib/features/code/hooks/use-coding-agent-session-model", () => ({
  useCodingAgentSessionModel: () => ({
    modelId: null,
    setModelId: vi.fn(),
    isLoading: false,
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
// The modal mounted on click fetches models / session model / skills.
vi.stubGlobal("fetch", () =>
  Promise.resolve({ ok: true, json: async () => ({ models: [] }) }),
);

const BUTTON = "Open markdown in a new coding agent session";

const readyLoad = (sourceContent: string): LoadState => ({
  status: "ready",
  sourceContent,
  lines: sourceContent.split("\n").map((content, index) => ({
    id: `${index + 1}`,
    content,
    tokens: [{ content, offset: 0 }] as unknown as DisplayLine["tokens"],
    oldLineNumber: null,
    newLineNumber: index + 1,
    changeKind: "unchanged",
    navigationIndex: null,
  })),
});

const renderFrame = (path: string, load: unknown, scope: "tree" | "uncommitted" = "uncommitted") =>
  render(
    <FileBrowserProvider project="p" sessionId="s" initialLocation={{ scope }}>
      <CodeViewFrame
        path={path}
        load={load as never}
        navigationCount={0}
        selectorForIndex={() => null}
        onBack={() => {}}
      />
    </FileBrowserProvider>,
  );

afterEach(cleanup);

describe("CodeViewFrame markdown-to-session button", () => {
  it("shows for a ready Markdown file in both the tree and diff scopes", () => {
    const source = "# Title\n\nBody";
    const tree = renderFrame("README.md", readyLoad(source), "tree");
    expect(tree.getByLabelText(BUTTON)).toBeTruthy();
    cleanup();

    const diff = renderFrame("README.md", readyLoad(source), "uncommitted");
    expect(diff.getByLabelText(BUTTON)).toBeTruthy();
  });

  it("is hidden for non-Markdown files and while loading", () => {
    const code = renderFrame("src/app.tsx", readyLoad("const x = 1;"));
    expect(code.queryByLabelText(BUTTON)).toBeNull();
    cleanup();

    const loading = renderFrame("README.md", { status: "loading" });
    expect(loading.queryByLabelText(BUTTON)).toBeNull();
  });

  it("opens the modal with the Markdown content on click", () => {
    const view = renderFrame("README.md", readyLoad("# Title\n\nBody"));
    fireEvent.click(view.getByLabelText(BUTTON));
    expect(screen.getByRole("dialog", { name: "New session from README.md" })).toBeTruthy();
  });
});
