import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionEventLog } from "../../../src/agui/event-log";
import { AguiEventType as EventType } from "../../../src/agui/agui-event";
import { SessionRegistry } from "../../../src/session/session-registry";
import { resolveUserMessageEntry } from "../../../src/session/message-edit-target";
import { TurnRunner } from "../../../src/session/turn-runner";
import type { SessionEntry } from "../../../src/session/session-entry";

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

type Message = { role: string; content: unknown; timestamp: number; clientMessageId?: string };

const assistantMessage = (timestamp: number): Message => ({
  role: "assistant",
  content: [{ type: "text", text: `answer ${timestamp}` }],
  timestamp,
});

/**
 * A Pi session shaped like a real one: user/assistant pairs appended to a
 * real in-memory `SessionManager`, with `navigateTree` implemented with the
 * SDK's own semantics for a user-message target (leaf moves to its parent and
 * the visible message list is rebuilt from the tree).
 */
function createBranchableSession() {
  const manager = SessionManager.inMemory("/tmp/message-edit-project");
  const visibleMessages = () => manager.buildSessionContext().messages as unknown as Message[];

  const listeners = new Set<(event: unknown) => void>();

  const session: any = {
    sessionManager: manager,
    agent: { state: { messages: visibleMessages() } },
    isStreaming: false,
    thinkingLevel: "off",
    model: { provider: "model-gateway", id: "test-model" },
    getAvailableThinkingLevels: () => ["off", "high"],
    setThinkingLevel: vi.fn(),
    setModel: vi.fn(),
    subscribe: vi.fn((listener: (event: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    prompt: vi.fn(() => {
      // One `agent_start` is enough for the translator to emit RUN_STARTED,
      // right after which the collector appends the run's MESSAGES_SNAPSHOT.
      for (const listener of listeners) listener({ type: "agent_start" });
      return Promise.resolve();
    }),
    resourceLoader: {
      getSkills: () => ({ skills: [] }),
      getExtensions: () => ({ extensions: [] }),
      getAppendSystemPrompt: () => [],
    },
    systemPrompt: "",
    navigateTree: vi.fn(async (targetId: string) => {
      const target = manager.getEntry(targetId);
      if (!target) throw new Error(`Entry ${targetId} not found`);
      if (target.parentId === null) manager.resetLeaf();
      else manager.branch(target.parentId);
      session.agent.state.messages = visibleMessages();
      return { cancelled: false };
    }),
  };
  Object.defineProperty(session, "messages", { get: visibleMessages });

  /** Append a user/assistant pair; returns the user message's AG-UI id. */
  const appendTurn = (timestamp: number, text: string, clientMessageId?: string) => {
    const user: Message = { role: "user", content: text, timestamp };
    if (clientMessageId) user.clientMessageId = clientMessageId;
    manager.appendMessage(user as never);
    manager.appendMessage(assistantMessage(timestamp + 1) as never);
    return clientMessageId ?? `u-${timestamp}`;
  };

  return { manager, session, appendTurn };
}
describe("resolveUserMessageEntry", () => {
  it("falls back to the derived u-<timestamp> id and disambiguates collisions", () => {
    const manager = SessionManager.inMemory("/tmp/message-edit-project");
    const first = manager.appendMessage({ role: "user", content: "a", timestamp: 1000 } as never);
    const second = manager.appendMessage({ role: "user", content: "b", timestamp: 1000 } as never);
    const answered = manager.appendMessage(assistantMessage(2000) as never);

    expect(resolveUserMessageEntry(manager, "u-1000")?.entryId).toBe(first);
    expect(resolveUserMessageEntry(manager, "u-1000-2")?.entryId).toBe(second);
    // Assistant messages are not Message Edit targets.
    expect(resolveUserMessageEntry(manager, "a-2000")).toBeUndefined();
    expect(answered).toBeTruthy();
  });

  it("prefers the clientMessageId stamped on the message over the derived id", () => {
    const manager = SessionManager.inMemory("/tmp/message-edit-project");
    const entryId = manager.appendMessage({
      role: "user",
      content: "typed by the user",
      timestamp: 1000,
      clientMessageId: "2f1c-uuid",
    } as never);

    expect(resolveUserMessageEntry(manager, "2f1c-uuid")?.entryId).toBe(entryId);
    expect(resolveUserMessageEntry(manager, "u-1000")).toBeUndefined();
  });
});

describe("Message Edit (rewind before prompting)", () => {
  let registry: SessionRegistry;
  let runner: TurnRunner;
  let projectsRoot: string;

  beforeEach(() => {
    projectsRoot = mkdtempSync(join(tmpdir(), "message-edit-"));
    registry = new SessionRegistry(undefined, { projectsRoot });
    runner = new TurnRunner(registry);
  });

  afterEach(() => {
    rmSync(projectsRoot, { recursive: true, force: true });
  });

  function seed(sessionId: string, mock: ReturnType<typeof createBranchableSession>): SessionEntry {
    const entry: SessionEntry = {
      sessionId,
      project: "p",
      runtime: { session: mock.session } as never,
      eventLog: new SessionEventLog(),
    };
    registry.set(sessionId, entry);
    return entry;
  }

  it("rewinds to just before the edited message and ships the shortened snapshot", async () => {
    const mock = createBranchableSession();
    mock.appendTurn(1000, "first question", "client-1");
    const edited = mock.appendTurn(2000, "second question", "client-2");
    const entry = seed("s1", mock);

    const stream = await runner.sendPrompt("s1", "edited question", [{ id: "u1", role: "user", content: "edited question" }], "r1", {
      branchFromMessageId: edited,
    });

    expect(mock.session.navigateTree).toHaveBeenCalledTimes(1);
    const [targetId] = mock.session.navigateTree.mock.calls[0]!;
    expect(mock.manager.getEntry(targetId as string)?.type).toBe("message");
    // Visible history is now only the first question and its answer.
    expect(mock.session.messages.map((message) => message.role)).toEqual(["user", "assistant"]);

    const snapshot = entry
      .eventLog!.readAfter(0)
      .map((logged) => logged.event)
      .find((event) => event.type === EventType.MESSAGES_SNAPSHOT) as
      | { messages: Array<{ role: string }> }
      | undefined;
    expect(snapshot?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);

    await stream.cancel();
  });

  it("parks the resume cursor at the tail so a reconnect never replays the abandoned branch", async () => {
    const mock = createBranchableSession();
    const first = mock.appendTurn(1000, "first question", "client-1");
    mock.appendTurn(2000, "second question", "client-2");
    const entry = seed("s2", mock);
    entry.eventLog!.append({ type: EventType.RUN_STARTED, threadId: "s2", runId: "old-run", timestamp: 1 } as never);

    const stream = await runner.sendPrompt("s2", "edited", undefined, "r2", { branchFromMessageId: first });

    expect(entry.snapshotCursorSeq).toBe(1);
    await stream.cancel();
  });

  it("refuses a message that is not in the active session history", async () => {
    const mock = createBranchableSession();
    mock.appendTurn(1000, "first question", "client-1");
    seed("s3", mock);

    await expect(
      runner.sendPrompt("s3", "edited", undefined, "r3", { branchFromMessageId: "nope" }),
    ).rejects.toThrow("Message not found in the active session history");
    expect(mock.session.navigateTree).not.toHaveBeenCalled();
    expect(mock.session.prompt).not.toHaveBeenCalled();
  });

  it("refuses to rewind into an abandoned branch", async () => {
    const mock = createBranchableSession();
    const abandoned = mock.appendTurn(1000, "abandoned question", "client-1");
    // A previous rewind already took the first turn off the active path:
    // reset the leaf to the root and start a second branch.
    mock.manager.resetLeaf();
    mock.appendTurn(2000, "surviving question", "client-2");
    seed("s4", mock);

    await expect(
      runner.sendPrompt("s4", "edited", undefined, "r4", { branchFromMessageId: abandoned }),
    ).rejects.toThrow("Message not found in the active session history");
  });

  it("refuses to rewind while the agent is running", async () => {
    const mock = createBranchableSession();
    const first = mock.appendTurn(1000, "first question", "client-1");
    mock.session.isStreaming = true;
    seed("s5", mock);

    await expect(
      runner.sendPrompt("s5", "edited", undefined, "r5", { branchFromMessageId: first }),
    ).rejects.toThrow("Cannot edit a message while the agent is running");
    expect(mock.session.navigateTree).not.toHaveBeenCalled();
  });

  it("moves to the parent directly when the edited message is already the leaf", async () => {
    const mock = createBranchableSession();
    mock.appendTurn(1000, "first question", "client-1");
    const answerId = mock.manager.getLeafId();
    const failing: Message = { role: "user", content: "boom", timestamp: 3000, clientMessageId: "client-3" };
    mock.manager.appendMessage(failing as never);
    seed("s6", mock);

    const stream = await runner.sendPrompt("s6", "edited boom", undefined, "r6", {
      branchFromMessageId: "client-3",
    });

    // `navigateTree` would be a no-op here; the leaf must still move to the
    // parent so the prompt replaces the edited message instead of duplicating it.
    expect(mock.session.navigateTree).not.toHaveBeenCalled();
    expect(mock.session.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(mock.manager.getLeafId()).toBe(answerId);

    await stream.cancel();
  });
});
