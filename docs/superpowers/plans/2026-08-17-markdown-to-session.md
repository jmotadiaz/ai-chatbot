# Markdown-to-Session Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating button to Markdown files in the coding-agent file browser that opens a modal (prefix textarea + model picker + chat controls) and, on submit, creates a coding-agent session and starts its first turn server-side.

**Architecture:** The submit calls the existing `createCodingAgentSession` action, extended to also start the first detached run on the worker (`initializeSession` + `sendPrompt`) before the client ever connects. The user then navigates to the new session whose normal reconnect boot replays the already-started turn from the worker event log — no client-side handoff, DB column, or claim mechanism.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Vitest + Testing Library, tailwindcss, lucide-react.

## Global Constraints

- Package manager: **pnpm 11** workspace + Node 24. All commands run from the monorepo root or package root.
- No direct `process.env` in `src/` — use `config`.
- Modal MVP controls: **skills, undo/refine, send** only. **NO** attachments (`AttachmentsControl`) and **NO** reasoning (`ReasoningControl`).
- Prompt composition: `base = prependSkillCommands(prefix.trim(), selectedSkills)`; final prompt = `base ? `${base}\n\n${content}` : content`.
- Button visibility: exactly `canRenderMarkdown` (load ready + markdown path + `sourceContent` present), in both file and diff scopes — same as the Raw/Preview toggle.
- Codestyle: follow existing components (`agent-code-chat.tsx`, `code-view-frame.tsx`); empty prefix disables send.
- Every commit includes `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Test command per package: `cd packages/chatbot && NODE_ENV=test npx vitest run <file>`.

---

### Task 1: Server action starts the first run

Adds "the first request creates the session and starts the first turn" to the existing action. No route changes and no `piSessionId` (IDs are unified since `7add9dc`).

**Files:**
- Modify: `packages/chatbot/lib/features/code/actions.ts` — imports (lines 9, 13-17) + `createCodingAgentSession` (line 87) + new private helper.
- Test: `packages/chatbot/tests/unit/agent-code/create-session-initial-prompt.test.ts` (new).

**Interfaces:**
- Produces: `createCodingAgentSession(project: string, modelId?: string, initialPrompt?: string): Promise<{ sessionId: string }>`.
  - Without `initialPrompt`: unchanged (DB row only) — the "+" button path.
  - With `initialPrompt`: creates the DB row, initializes the worker session (`toPiModelId` mapping + `getDefaultThinkingLevel`), starts the detached run via `sendPrompt`, cancels the returned stream, sets a label from the prompt's first line, returns the row.
- This task's clients: the modal (Task 2) calls `createCodingAgentSession(project, effectiveModelId, prompt)`.

- [ ] **Step 1: Write the failing test**

Create `packages/chatbot/tests/unit/agent-code/create-session-initial-prompt.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/features/auth/auth-config", () => ({
  auth: async () => ({ user: { id: "user-1" } }),
}));

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  FileTraceSink: class {
    async open() {}
    async close() {}
  },
  runWithTraceContext: <T>(_ctx: unknown, fn: () => Promise<T>) => fn(),
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

vi.mock("config", () => ({
  config: { codingAgentEnabled: () => true },
  optional: <T>(fn: () => T) => fn(),
}));

const state = vi.hoisted(() => ({
  initParams: [] as unknown[],
  sendParams: [] as unknown[],
  streamCancelled: false,
  savedLabel: null as string | null,
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async initializeSession(params: unknown) {
      state.initParams.push(params);
      return { sessionId: "s1" };
    }
    async sendPrompt(params: unknown) {
      state.sendParams.push(params);
      return {
        cancel: async () => {
          state.streamCancelled = true;
        },
      };
    }
  },
}));

vi.mock("@/lib/features/code/session-store", () => ({
  createSession: vi.fn(async () => ({
    sessionId: "s1",
    userId: "user-1",
    project: "p",
    modelId: "Deepseek v4 Pro",
    label: null,
    updatedAt: new Date(),
  })),
  updateSessionLabel: vi.fn(async (input: { label: string }) => {
    state.savedLabel = input.label;
  }),
  getSession: vi.fn(),
}));

import { createCodingAgentSession } from "@/lib/features/code/actions";

beforeEach(() => {
  state.initParams = [];
  state.sendParams = [];
  state.streamCancelled = false;
  state.savedLabel = null;
});

describe("createCodingAgentSession", () => {
  it("creates the row and starts the detached run with the initial prompt", async () => {
    const result = await createCodingAgentSession(
      "p",
      "Deepseek v4 Pro",
      "# Task\n\nRefactor this.",
    );

    expect(result.sessionId).toBe("s1");

    const init = state.initParams[0] as {
      sessionId: string;
      project: string;
      modelId?: string;
      thinkingLevel?: string;
      _traceRunId?: string;
    };
    expect(init.sessionId).toBe("s1");
    expect(init.project).toBe("p");
    expect(init.modelId).toBe("opencode-go/deepseek-v4-pro");
    expect(init.thinkingLevel).toBe("xhigh");
    expect(init._traceRunId).toBeTruthy();

    const send = state.sendParams[0] as {
      sessionId: string;
      prompt: string;
      _traceRunId?: string;
    };
    expect(send.sessionId).toBe("s1");
    expect(send.prompt).toBe("# Task\n\nRefactor this.");
    expect(send._traceRunId).toBe(init._traceRunId);

    // The request's stream is cancelled so the action returns immediately,
    // but the worker turn keeps running (detached); events stay in its log.
    expect(state.streamCancelled).toBe(true);
  });

  it("labels the session with the first line of the prompt", async () => {
    await createCodingAgentSession("p", "Deepseek v4 Pro", "Fix the bug\n\nDetails here.");
    expect(state.savedLabel).toBe("Fix the bug");
  });

  it("skips the worker entirely when no initial prompt is given", async () => {
    const result = await createCodingAgentSession("p");
    expect(result.sessionId).toBe("s1");
    expect(state.initParams).toHaveLength(0);
    expect(state.sendParams).toHaveLength(0);
    expect(state.savedLabel).toBeNull();
  });
});
```

Note: `getDefaultThinkingLevel("Deepseek v4 Pro")` is `"xhigh"` and `toPiModelId("Deepseek v4 Pro")` is `{ providerId: "opencode-go", modelId: "deepseek-v4-pro" }` (verified against `run-route-thinking-level.test.ts`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/chatbot && NODE_ENV=test npx vitest run tests/unit/agent-code/create-session-initial-prompt.test.ts`
Expected: FAIL — `sendPrompt`/`initializeSession` never called, `state.sendParams` empty (the action has no `initialPrompt` param yet).

- [ ] **Step 3: Implement the action changes**

In `packages/chatbot/lib/features/code/actions.ts`:

1. Update imports (lines 3-17):

```ts
import { getDefaultThinkingLevel, toChatModelId, toPiModelId } from "models";
import type { InvocableModelId, ThinkingLevel } from "models";
...
import {
  createSession,
  getSession,
  listSessions,
  updateSessionLabel,
} from "./session-store";
...
import { parseLeadingSkillCommands } from "./skill-commands";
import type { chatModelId } from "@/lib/features/foundation-model/config";
```

2. Replace `createCodingAgentSession` (line 87) and add the helper after it:

```ts
export async function createCodingAgentSession(
  project: string,
  modelId?: string,
  initialPrompt?: string,
) {
  return withActionTrace("createCodingAgentSession", async (log) => {
    assertEnabled();
    const userId = await getUserId();
    const result = await createSession({
      userId,
      project,
      modelId: modelId || undefined,
    });
    log.info("action.result", { sessionId: result.sessionId });

    if (initialPrompt) {
      await startInitialRun({
        userId,
        project,
        sessionId: result.sessionId,
        modelId,
        initialPrompt,
        log,
      });
    }

    return result;
  });
}

/**
 * A session created from the Markdown button carries its first prompt in the
 * same request: the worker starts the first turn detached (events land in the
 * session event log) before the client ever connects, so navigating to the
 * session later just reconnects and replays like any open session.
 */
async function startInitialRun(args: {
  userId: string;
  project: string;
  sessionId: string;
  modelId?: string;
  initialPrompt: string;
  log: ReturnType<typeof getTraceLogger>;
}) {
  const { userId, project, sessionId, modelId, initialPrompt, log } = args;
  const runId = crypto.randomUUID();
  const client = new WorkerClient();

  const piModelId = modelId ? toPiModelId(modelId as chatModelId) : undefined;
  const modelRef = piModelId
    ? `${piModelId.providerId}/${piModelId.modelId}`
    : undefined;
  const thinkingLevel = modelId
    ? getDefaultThinkingLevel(modelId as chatModelId)
    : undefined;

  await client.initializeSession({
    userId,
    sessionId,
    project,
    modelId: modelRef,
    thinkingLevel,
    _traceRunId: runId,
  });

  const stream = await client.sendPrompt({
    sessionId,
    prompt: initialPrompt,
    _traceRunId: runId,
  });
  // The turn is detached from this request: closing the relay stream must not
  // abort it. The worker retains the run sink and keeps logging to the event
  // log, which is what a later reconnect replays.
  await stream.cancel().catch(() => {});

  const label = parseLeadingSkillCommands(initialPrompt).text
    .trim()
    .split("\n")[0]
    ?.slice(0, 80);
  if (label) {
    await updateSessionLabel({ userId, sessionId, label });
  }
  log.info("initial_run_started", { sessionId, modelRef, runId });
}
```

`crypto.randomUUID` is the global from Node 24 — no import needed. The worker already ref-counts the run sink per `_traceRunId` (`acquireTraceSink` in the HTTP transport + `retainTraceSink` in `startPromptCollector`), so tracing survives the cancelled stream.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/chatbot && NODE_ENV=test npx vitest run tests/unit/agent-code/create-session-initial-prompt.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the neighboring action tests to confirm nothing regressed**

Run: `cd packages/chatbot && NODE_ENV=test npx vitest run tests/unit/agent-code/run-route-thinking-level.test.ts` and `.../run-route-attachments.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/chatbot/lib/features/code/actions.ts packages/chatbot/tests/unit/agent-code/create-session-initial-prompt.test.ts
git commit -m "feat(agent-code): start the first run from createCodingAgentSession

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Markdown-to-session modal

The modal the button opens: prefix textarea only, model picker above, skills + undo/refine/send controls, no attachments or reasoning.

**Files:**
- Create: `packages/chatbot/components/code/markdown-to-session-modal.tsx`
- Test: `packages/chatbot/tests/component/agent-code/markdown-to-session-modal.test.tsx`

**Interfaces:**
- Consumes: `createCodingAgentSession(project: string, modelId?: string, initialPrompt?: string)` (Task 1); hooks `useCodingAgentSessionModel`, `useCodingAgentSkills`, `useCodingAgentPrompts`, `usePromptRefiner`; components `ModelPickerSelector`, `ModelPickerLoading`, `Textarea`, `ChatControl`, `SkillChip`, `SkillsControl`, `PromptFormModal`; helper `prependSkillCommands`.
- Produces: `MarkdownToSessionModal({ onClose: () => void; path: string; content: string; project: string; sessionId: string })` — renders an overlay modal, mounts only when the button opens it (no `open` prop; the caller conditionally renders it).

- [ ] **Step 1: Write the failing component test**

Create `packages/chatbot/tests/component/agent-code/markdown-to-session-modal.test.tsx`:

```tsx
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
    prompts: [],
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
// The component's own availabilities fetch.
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

const renderModal = () =>
  render(
    <MarkdownToSessionModal
      path="docs/guide.md"
      content="# Guide body"
      project="p"
      sessionId="s"
      onClose={() => {}}
    />,
  );

describe("MarkdownToSessionModal", () => {
  it("shows the filename and an empty prefix textarea", () => {
    renderModal();
    expect(
      screen.getByRole("dialog", { name: "New session from guide.md" }),
    ).toBeTruthy();
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("disables send with no prefix", () => {
    renderModal();
    expect(screen.getByLabelText("Send message")).toBeDisabled();
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/chatbot && NODE_ENV=test npx vitest run tests/component/agent-code/markdown-to-session-modal.test.tsx`
Expected: FAIL — module `@/components/code/markdown-to-session-modal` not found (or cannot render).

- [ ] **Step 3: Implement the modal**

Create `packages/chatbot/components/code/markdown-to-session-modal.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Undo, WandSparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  ModelPickerLoading,
  ModelPickerSelector,
} from "@/components/chat/model-picker";
import { Textarea } from "@/components/chat/textarea";
import { ChatControl } from "@/components/chat/control";
import { SkillChip } from "./skill-chip";
import { SkillsControl } from "./skills-control";
import { PromptFormModal } from "./prompt-form-modal";
import { createCodingAgentSession } from "@/lib/features/code/actions";
import { useCodingAgentSessionModel } from "@/lib/features/code/hooks/use-coding-agent-session-model";
import { useCodingAgentSkills } from "@/lib/features/code/hooks/use-coding-agent-skills";
import { useCodingAgentPrompts } from "@/lib/features/code/hooks/use-coding-agent-prompts";
import { usePromptRefiner } from "@/lib/features/meta-prompt/hooks/use-prompt-refiner";
import { prependSkillCommands } from "@/lib/features/code/skill-commands";
import type { PromptSummary } from "@/lib/features/code/worker-client";
import type { chatModelId } from "@/lib/features/foundation-model/config";

export interface MarkdownToSessionModalProps {
  onClose: () => void;
  /** File path whose Markdown content becomes the prompt body. */
  path: string;
  /** Full Markdown source, appended to the prefix. */
  content: string;
  project: string;
  sessionId: string;
}

interface WorkerModel {
  id: string;
  levels: unknown[];
}

export const MarkdownToSessionModal: React.FC<MarkdownToSessionModalProps> = ({
  onClose,
  path,
  content,
  project,
  sessionId,
}) => {
  const router = useRouter();
  const [prefix, setPrefix] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [promptModal, setPromptModal] = useState<PromptSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/agent/code/models");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { models?: WorkerModel[] };
        if (!cancelled) setAvailableModels((data.models ?? []).map((m) => m.id));
      } catch {
        // The picker degrades to the session's model or stays empty.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Default selection: the session we are browsing in; fall back to the first
  // available model once the list arrives.
  const { modelId, setModelId, isLoading: isLoadingModel } =
    useCodingAgentSessionModel({
      sessionId,
      fallbackModelId: availableModels[0] ?? "",
    });
  const effectiveModelId = modelId || availableModels[0] || ("" as chatModelId);

  const { skills, isLoading: isLoadingSkills, error: skillsError } =
    useCodingAgentSkills(sessionId, true);
  const { prompts, sessions, isLoading: isLoadingPrompts, error: promptsError } =
    useCodingAgentPrompts(sessionId, true);

  const { isLoadingRefinedPrompt, refinePrompt, undo, hasPreviousMessage } =
    usePromptRefiner({ input: prefix, setInput: setPrefix, mode: "coding-agent" });

  const canSubmit =
    !isConverting &&
    !isLoadingModel &&
    !!effectiveModelId &&
    (!!prefix.trim() || selectedSkills.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const base = prependSkillCommands(prefix.trim(), selectedSkills);
    const prompt = base ? `${base}\n\n${content}` : content;
    setIsConverting(true);
    try {
      const session = await createCodingAgentSession(project, effectiveModelId, prompt);
      router.push(`/agent/code/${encodeURIComponent(project)}/${session.sessionId}`);
    } catch {
      toast.error("Failed to create coding agent session");
      setIsConverting(false);
    }
  };

  const toggleSkill = (name: string) =>
    setSelectedSkills((current) =>
      current.includes(name)
        ? current.filter((skill) => skill !== name)
        : [...current, name],
    );

  const handlePromptInsert = (text: string) => {
    setPrefix((prev) => (prev ? `${prev}\n\n${text}` : text));
    setPromptModal(null);
  };

  const filename = path.split("/").pop() ?? path;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`New session from ${filename}`}
        className="mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">New session from {filename}</h2>
            <p className="truncate text-sm text-muted-foreground">
              The file&apos;s Markdown will be sent as the prompt body.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3 px-6 pt-4">
          <span className="text-sm font-medium text-muted-foreground">Model</span>
          <div className="min-w-0 flex-1">
            {isLoadingModel ? (
              <ModelPickerLoading />
            ) : (
              <ModelPickerSelector
                id="markdown-to-session-model"
                selectedModel={effectiveModelId as chatModelId}
                setSelectedModel={setModelId as (m: chatModelId) => void}
                models={availableModels as chatModelId[]}
                dropdownVariant="responsive-bottom-right"
              />
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4">
          <div className="relative w-full">
            <Textarea
              onChangeInput={setPrefix}
              input={prefix}
              isLoading={isConverting}
              placeholder="Instructions for the session…"
              leadingContent={
                selectedSkills.length > 0 ? (
                  <div className="flex flex-wrap gap-2 px-4 pt-3" aria-label="Selected skills">
                    {selectedSkills.map((skill) => (
                      <SkillChip key={skill} name={skill} onRemove={() => toggleSkill(skill)} />
                    ))}
                  </div>
                ) : undefined
              }
            />
            <div className="absolute bottom-2 left-3 flex items-center space-x-2">
              <SkillsControl
                skills={skills}
                selectedSkills={selectedSkills}
                onToggle={toggleSkill}
                isLoading={isLoadingSkills}
                error={skillsError}
                prompts={prompts}
                isLoadingPrompts={isLoadingPrompts}
                promptsError={promptsError}
                onPromptSelect={setPromptModal}
              />
            </div>
            <div className="absolute bottom-2 right-3 flex items-center space-x-2">
              {hasPreviousMessage && (
                <ChatControl Icon={Undo} onClick={undo} aria-label="Undo refined prompt" />
              )}
              <ChatControl
                Icon={WandSparkles}
                onClick={refinePrompt}
                disabled={!prefix.length}
                isLoading={isLoadingRefinedPrompt}
                aria-label="Refine prompt"
              />
              <ChatControl
                Icon={ArrowUp}
                type="submit"
                aria-label="Send message"
                disabled={!canSubmit}
                isLoading={isConverting}
              />
            </div>
          </div>
        </form>
      </div>

      {promptModal && (
        <PromptFormModal
          prompt={promptModal}
          sessionId={sessionId}
          sessions={sessions}
          open={!!promptModal}
          onClose={() => setPromptModal(null)}
          onInsert={handlePromptInsert}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/chatbot && NODE_ENV=test npx vitest run tests/component/agent-code/markdown-to-session-modal.test.tsx`
Expected: PASS (4 tests). If `screen.getByLabelText("Send message")` is disabled because `isLoadingModel` never resolves, confirm the `useCodingAgentSessionModel` mock returns `modelId: "Deepseek v4 Pro"` (not null) so `isLoading` is false.

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/components/code/markdown-to-session-modal.tsx packages/chatbot/tests/component/agent-code/markdown-to-session-modal.test.tsx
git commit -m "feat(agent-code): markdown-to-session modal with prefix and model picker

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Floating button in CodeViewFrame

Adds the bottom-right button (same style and visibility as the Raw/Preview toggle) and mounts the modal on click.

**Files:**
- Modify: `packages/chatbot/components/code/file-browser/code-view-frame.tsx` — lucide import (line 3), state near line 64, body container (button, around the Raw/Preview block at ~line 215), modal render at the root (~line 295).
- Test: `packages/chatbot/tests/component/agent-code/code-view-frame.test.tsx` (new).

**Interfaces:**
- Consumes: `MarkdownToSessionModal` (Task 2); `useFileBrowser()` returns `{ state, actions, project, sessionId }`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing component test**

Create `packages/chatbot/tests/component/agent-code/code-view-frame.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  CodeViewFrame,
  type DisplayLine,
  type LoadState,
} from "@/components/code/file-browser/code-view-frame";
import { FileBrowserProvider } from "@/components/code/file-browser/file-browser-provider";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/chatbot && NODE_ENV=test npx vitest run tests/component/agent-code/code-view-frame.test.tsx`
Expected: FAIL — `getByLabelText(BUTTON)` throws "Unable to find".

- [ ] **Step 3: Implement the button + modal mount**

In `packages/chatbot/components/code/file-browser/code-view-frame.tsx`:

1. Add `Send` to the lucide import (line 3):

```tsx
import {
  Code2,
  ChevronDown,
  ChevronUp,
  Eye,
  FileQuestion,
  FileX,
  Send,
  Trash2,
  X,
} from "lucide-react";
```

2. Add the import for the modal (after the `MarkdownPreview` import):

```tsx
import { MarkdownToSessionModal } from "../markdown-to-session-modal";
```

3. Add state next to the existing `useState` calls (~line 64):

```tsx
const [sessionModalOpen, setSessionModalOpen] = useState(false);
```

4. Destructure `project` and `sessionId` from `useFileBrowser()`:

```tsx
const { state, actions, project, sessionId } = useFileBrowser();
```

5. Add the floating button just after the closing `</div>` of the Raw/Preview toggle block (inside the `relative flex-1 overflow-hidden` container, guarded by `canRenderMarkdown`):

```tsx
{canRenderMarkdown && (
  <div className="absolute bottom-2 right-2 z-10">
    <Button
      variant="icon"
      size="icon"
      type="button"
      aria-label="Open markdown in a new coding agent session"
      title="Open markdown in a new coding agent session"
      onClick={() => setSessionModalOpen(true)}
      className="bg-zinc-100 p-2.5 text-zinc-500 shadow-sm hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
    >
      <Send size={16} />
    </Button>
  </div>
)}
```

6. Render the modal at the root of the component's return (after the closing `</div>` of `flex h-full flex-col`):

```tsx
{sessionModalOpen && load.status === "ready" && (
  <MarkdownToSessionModal
    path={path}
    content={load.sourceContent ?? ""}
    project={project}
    sessionId={sessionId}
    onClose={() => setSessionModalOpen(false)}
  />
)}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/chatbot && NODE_ENV=test npx vitest run tests/component/agent-code/code-view-frame.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/components/code/file-browser/code-view-frame.tsx packages/chatbot/tests/component/agent-code/code-view-frame.test.tsx
git commit -m "feat(agent-code): markdown-to-session button in the file browser

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Full verification

Confirms the whole package is green and the feature type-checks end to end.

- [ ] **Step 1: Run the chatbot suite**

Run: `cd packages/chatbot && NODE_ENV=test npx vitest run`
Expected: ALL PASS (unit + component + integration + contract).

- [ ] **Step 2: Type-check**

Run: `cd packages/chatbot && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint the touched files**

Run: `cd /home/javier/projects/ai-chatbot && pnpm exec eslint packages/chatbot/lib/features/code/actions.ts packages/chatbot/components/code/markdown-to-session-modal.tsx packages/chatbot/components/code/file-browser/code-view-frame.tsx`
Expected: no errors.

- [ ] **Step 4: Manual smoke (optional, with dev services up)**

Run `pnpm dev`, open a session's file browser, open a `.md` file, click the bottom-right button, type a prefix, pick a model, send → lands on the new session whose turn is already running and replays.

- [ ] **Step 5: Final commit (only if Step 1-3 produced fixes)**

```bash
git add -A
git commit -m "test(agent-code): verify markdown-to-session feature

Co-Authored-By: Claude <noreply@anthropic.com>"
```
If Step 1-3 pass with no changes, skip this commit.
