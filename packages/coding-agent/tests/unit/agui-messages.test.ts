import { describe, it, expect } from "vitest";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  convertPiMessagesToAgui,
  getTranscriptMessages,
} from "../../src/agui/agui-messages";
import { resolveUserMessageEntry } from "../../src/session/message-edit-target";

type PiMessage = {
  role: string;
  content: unknown;
  timestamp: number;
  toolCallId?: string;
  clientMessageId?: string;
};

const user = (timestamp: number, text: string, clientMessageId?: string): Message => ({
  role: "user",
  content: text,
  timestamp,
  ...(clientMessageId ? { clientMessageId } : {}),
}) as never;

const assistant = (timestamp: number, text: string): Message =>
  ({
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp,
  }) as never;

const toolResult = (toolCallId: string, timestamp: number): Message =>
  ({
    role: "toolResult",
    toolCallId,
    content: [{ type: "text", text: `result of ${toolCallId}` }],
    timestamp,
  }) as never;

/**
 * Build a session whose history has already been compacted: two old turns
 * (user+assistant each), a compaction entry that summarizes them, and the
 * kept tail (turn three) still in the active path.
 */
function createCompactedSession() {
  const manager = SessionManager.inMemory("/tmp/agui-transcript-project");
  manager.appendMessage(user(1000, "old question 1", "client-1") as never);
  manager.appendMessage(assistant(1001, "old answer 1") as never);
  manager.appendMessage(user(2000, "old question 2", "client-2") as never);
  manager.appendMessage(assistant(2001, "old answer 2") as never);
  const firstKeptEntryId = manager.appendMessage(assistant(3000, "kept answer 3") as never);
  manager.appendMessage(toolResult("call-3", 3001) as never);
  manager.appendMessage(user(4000, "recent question 4", "client-4") as never);

  manager.appendCompaction("summary of turns 1-2", firstKeptEntryId, 50000);

  const session = {
    get messages() {
      return manager.buildSessionContext().messages as unknown as PiMessage[];
    },
    sessionManager: manager,
  };
  return { manager, session, firstKeptEntryId };
}

describe("getTranscriptMessages", () => {
  it("survives compaction: every entry of the active branch is still in the transcript", () => {
    const { session, firstKeptEntryId } = createCompactedSession();

    // Sanity: the LLM context really did lose the pre-compaction turns…
    const context = session.messages as unknown as Array<{ role: string }>;
    expect(context.some((m) => m.role === "compactionSummary")).toBe(true);
    expect(context.filter((m) => m.role === "user")).toHaveLength(1);

    // …while the transcript keeps them all (compaction node excluded).
    const transcript = getTranscriptMessages(session) as unknown as Array<{ role: string }>;
    expect(transcript.filter((m) => m.role === "user")).toHaveLength(3);
    expect(transcript.filter((m) => m.role === "assistant")).toHaveLength(3);
    expect(transcript.filter((m) => m.role === "compactionSummary")).toHaveLength(0);
    expect(firstKeptEntryId).toBeTruthy();
  });

  it("excludes the messages of an abandoned branch", () => {
    const manager = SessionManager.inMemory("/tmp/agui-transcript-project");
    manager.appendMessage(user(1000, "abandoned question", "client-1") as never);
    manager.appendMessage(assistant(1001, "abandoned answer") as never);
    manager.resetLeaf();
    manager.appendMessage(user(2000, "surviving question", "client-2") as never);

    const transcript = getTranscriptMessages({ messages: [], sessionManager: manager }) as unknown as Array<{
      role: string;
      content?: string;
    }>;
    expect(transcript.map((m) => m.content)).toEqual(["surviving question"]);
  });

  it("falls back to the LLM context when no session manager is attached", () => {
    const session = {
      messages: [{ role: "user", content: "hello", timestamp: 123 }] as unknown[],
    };
    expect(getTranscriptMessages(session as never)).toEqual(session.messages);
    expect(getTranscriptMessages({ messages: [] } as never)).toEqual([]);
  });
});

describe("convertPiMessagesToAgui over the full branch", () => {
  it("the post-compaction reconnect snapshot restores the whole history", () => {
    const { session } = createCompactedSession();
    // First run: compaction already happened, the client reconnects / reloads.
    // `getSessionMessages` (session-queries) converts exactly this.
    const agui = convertPiMessagesToAgui(getTranscriptMessages(session));

    const roles = agui.map((m: { role: string; id: string }) => `${m.role}:${m.id}`);
    expect(roles).toEqual([
      "user:client-1",
      "assistant:a-1001",
      "user:client-2",
      "assistant:a-2001",
      "assistant:a-3000",
      "tool:tool-result-call-3",
      "user:client-4",
    ]);
  });
});

describe("resolveUserMessageEntry across a compaction boundary", () => {
  it("finds and can target a Message Edit done BEFORE the latest compaction", () => {
    const { manager } = createCompactedSession();

    // client-2 is one turn behind the compaction entry.
    const target = resolveUserMessageEntry(manager, "client-2");
    expect(target).toBeDefined();

    // The rewind semantics stay intact: leaf moves to the message's parent,
    // so the compaction entry abandons with the kept tail and the LLM context
    // is rebuilt from the raw entries of the new path (no compactionSummary,
    // and the raw turns the summary had replaced are back).
    const entry = manager.getEntry(target!.entryId);
    expect(entry?.parentId).toBeDefined();
    manager.branch(entry!.parentId);
    const context = manager.buildSessionContext().messages as unknown as Array<{
      role: string;
      content?: unknown;
    }>;
    expect(context.some((m) => m.role === "compactionSummary")).toBe(false);
    expect(
      context.filter((m) => m.role === "user").map((m) => m.content),
    ).toEqual(["old question 1"]);
  });

  it("resolves the session's first message, whose rewind discards the whole path including the compaction", () => {
    const { manager } = createCompactedSession();
    const target = resolveUserMessageEntry(manager, "client-1");
    expect(target).toBeDefined();
    expect(target!.parentId).toBeNull();

    manager.resetLeaf();
    const context = manager.buildSessionContext().messages as unknown as Array<{ role: string }>;
    expect(context.some((m) => m.role === "compactionSummary")).toBe(false);
    expect(context).toEqual([]);
  });
});
