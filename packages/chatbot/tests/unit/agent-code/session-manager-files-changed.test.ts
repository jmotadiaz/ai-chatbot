import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { EventType } from "@ag-ui/client";
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import { clearInheritedGitRepositoryEnv } from "../../helpers/git-env";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { sendPrompt, __resetSessionsForTests, __seedSessionForTests } =
  await import("coding-agent/session-manager");
const { SessionEventLog } = await import("coding-agent/event-log");

const execFileAsync = promisify(execFile);

type Event = { type: string; [k: string]: unknown };
type Listener = (event: Event) => void;

function createMockPiSession(opts: { prompt?: () => Promise<void> }) {
  const listeners = new Set<Listener>();
  return {
    session: {
      messages: [],
      isStreaming: false,
      subscribe: vi.fn((cb: Listener) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      }),
      prompt: vi.fn(opts.prompt ?? (() => Promise.resolve())),
    },
    __emit(event: Event) {
      for (const l of listeners) l(event);
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function readAllEvents(
  stream: ReadableStream<Uint8Array>,
): Promise<Event[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }
  return buffer
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => (JSON.parse(line) as { event: Event }).event);
}

let projectsRoot: string;
const PROJECT = "proj";
let repo: string;
const savedRoot = process.env.CODING_AGENT_PROJECTS_ROOT;
let restoreGitEnv: () => void;

beforeAll(async () => {
  restoreGitEnv = clearInheritedGitRepositoryEnv();
  projectsRoot = await mkdtemp(join(tmpdir(), "worker-projects-"));
  repo = join(projectsRoot, PROJECT);
  await mkdir(repo);
  const git = (args: string[]) => execFileAsync("git", args, { cwd: repo });
  await execFileAsync("git", ["init", "-q"], { cwd: repo });
  await git(["config", "user.email", "test@test.local"]);
  await git(["config", "user.name", "Test"]);
  await writeFile(join(repo, "app.ts"), "export const a = 1;\n");
  await git(["add", "."]);
  await git(["commit", "-q", "-m", "init"]);
});

afterAll(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
  restoreGitEnv();
});

beforeEach(() => {
  __resetSessionsForTests();
  process.env.CODING_AGENT_PROJECTS_ROOT = projectsRoot;
});

afterEach(async () => {
  if (savedRoot === undefined) {
    delete process.env.CODING_AGENT_PROJECTS_ROOT;
  } else {
    process.env.CODING_AGENT_PROJECTS_ROOT = savedRoot;
  }
  // Reset the repo to a clean state for the next test.
  await execFileAsync("git", ["checkout", "-q", "--", "."], { cwd: repo });
  await execFileAsync("git", ["clean", "-qfd"], { cwd: repo });
});

describe("session-manager files-changed event", () => {
  it("emits coding_agent_files_changed with git-derived files before RUN_FINISHED", async () => {
    const prompt = deferred<void>();
    const mock = createMockPiSession({ prompt: () => prompt.promise });
    __seedSessionForTests("fc1", {
      sessionId: "fc1",
      piSessionId: "pi-fc1",
      project: PROJECT,
      runtime: { session: mock.session } as never,
      eventLog: new SessionEventLog(),
    });

    const stream = await sendPrompt("fc1", "edit the file", undefined, "r1");

    mock.__emit({ type: "agent_start" });
    // Simulate the agent editing a tracked file and creating a new one.
    await writeFile(join(repo, "app.ts"), "export const a = 2;\n");
    await writeFile(join(repo, "util.ts"), "export const b = 1;\n");
    mock.__emit({ type: "agent_end" });
    prompt.resolve();

    const events = await readAllEvents(stream);
    const types = events.map((e) => e.type);
    expect(types[types.length - 1]).toBe(EventType.RUN_FINISHED);
    expect(types[types.length - 2]).toBe(EventType.CUSTOM);

    const custom = events[events.length - 2] as {
      name?: string;
      value?: { runId?: string; files?: unknown };
    };
    expect(custom.name).toBe("coding_agent_files_changed");
    expect(custom.value?.runId).toBe("r1");
    expect(custom.value?.files).toEqual([
      { path: "app.ts", status: "modified" },
      { path: "util.ts", status: "untracked" },
    ]);
  });

  it("emits no files-changed event when the turn touched nothing", async () => {
    const prompt = deferred<void>();
    const mock = createMockPiSession({ prompt: () => prompt.promise });
    __seedSessionForTests("fc2", {
      sessionId: "fc2",
      piSessionId: "pi-fc2",
      project: PROJECT,
      runtime: { session: mock.session } as never,
      eventLog: new SessionEventLog(),
    });

    const stream = await sendPrompt("fc2", "just answer", undefined, "r2");
    mock.__emit({ type: "agent_start" });
    mock.__emit({ type: "agent_end" });
    prompt.resolve();

    const events = await readAllEvents(stream);
    expect(events.map((e) => e.type)).not.toContain(EventType.CUSTOM);
    expect(events[events.length - 1]?.type).toBe(EventType.RUN_FINISHED);
  });

  it("still terminates cleanly when the project is not a git repo", async () => {
    const nonGit = join(projectsRoot, "plain");
    await mkdir(nonGit, { recursive: true });
    const prompt = deferred<void>();
    const mock = createMockPiSession({ prompt: () => prompt.promise });
    __seedSessionForTests("fc3", {
      sessionId: "fc3",
      piSessionId: "pi-fc3",
      project: "plain",
      runtime: { session: mock.session } as never,
      eventLog: new SessionEventLog(),
    });

    const stream = await sendPrompt("fc3", "hello", undefined, "r3");
    mock.__emit({ type: "agent_start" });
    mock.__emit({ type: "agent_end" });
    prompt.resolve();

    const events = await readAllEvents(stream);
    expect(events.map((e) => e.type)).not.toContain(EventType.CUSTOM);
    expect(events[events.length - 1]?.type).toBe(EventType.RUN_FINISHED);
  });

  it("emits files-changed before the fallback RUN_ERROR when the prompt rejects", async () => {
    const mock = createMockPiSession({
      prompt: () => Promise.reject(new Error("model exploded")),
    });
    __seedSessionForTests("fc4", {
      sessionId: "fc4",
      piSessionId: "pi-fc4",
      project: PROJECT,
      runtime: { session: mock.session } as never,
      eventLog: new SessionEventLog(),
    });

    const stream = await sendPrompt("fc4", "edit then crash", undefined, "r4");
    mock.__emit({ type: "agent_start" });
    await writeFile(join(repo, "app.ts"), "export const a = 3;\n");

    const events = await readAllEvents(stream);
    const types = events.map((e) => e.type);
    expect(types[types.length - 1]).toBe(EventType.RUN_ERROR);
    expect(types[types.length - 2]).toBe(EventType.CUSTOM);
  });
});
