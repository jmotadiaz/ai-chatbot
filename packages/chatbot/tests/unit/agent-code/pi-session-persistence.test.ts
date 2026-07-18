import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { SessionManager, type SessionMessageEntry } from "@earendil-works/pi-coding-agent";

/**
 * Contract test against Pi's own persistence, independent of this worker's
 * code. `startPromptCollector` (packages/coding-agent/src/session-manager.ts)
 * relies on Pi's `SessionManager.appendMessage` round-tripping arbitrary
 * extra fields set on a message object (specifically `clientMessageId`)
 * through JSONL persistence and reload. If a future `@earendil-works/pi-coding-agent`
 * upgrade starts stripping unknown fields (e.g. by validating against a
 * strict schema before writing or after reading), this test fails first,
 * before it can silently break user-message id stability in production.
 */
describe("Pi SessionManager persistence contract", () => {
  let sessionDir: string;

  afterEach(() => {
    if (sessionDir) {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  });

  it("round-trips an extra field stamped on a user message through save + reload", () => {
    sessionDir = mkdtempSync(path.join(tmpdir(), "pi-session-persistence-"));
    const cwd = sessionDir;

    const manager = SessionManager.create(cwd, sessionDir);
    manager.appendMessage({
      role: "user",
      content: "hello from the client",
      timestamp: 1000,
      // The field under test: not part of Pi's UserMessage type, but the
      // worker relies on it surviving persistence verbatim.
      clientMessageId: "client-id-123",
    } as never);
    // Pi's SessionManager defers writing to disk until an assistant message
    // is appended (see `_persist` in dist/core/session-manager.js) — append
    // one purely to force the flush so the user message above is actually
    // written to the JSONL file.
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
      api: "messages",
      provider: "anthropic",
      model: "test-model",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: 2000,
    } as never);

    const sessionFile = manager.getSessionFile();
    expect(sessionFile).toBeDefined();

    // Reload the session from disk through Pi's own public load API.
    const reloaded = SessionManager.open(sessionFile!);
    const messageEntries = reloaded
      .getEntries()
      .filter((entry): entry is SessionMessageEntry => entry.type === "message");
    const userEntry = messageEntries.find((entry) => entry.message.role === "user");

    expect(userEntry).toBeDefined();
    expect((userEntry!.message as unknown as { clientMessageId?: string }).clientMessageId).toBe(
      "client-id-123",
    );
  });
});
