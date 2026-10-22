import { afterEach, describe, expect, it } from "vitest";
import {
  findSessionFileName,
  resolveSessionDir,
} from "../../src/session/session-file-lookup";

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("resolveSessionDir", () => {
  const savedAgentDir = process.env.PI_CODING_AGENT_DIR;

  afterEach(() => {
    restoreEnv("PI_CODING_AGENT_DIR", savedAgentDir);
  });

  it("mirrors Pi's --<encoded cwd>-- sessions directory", () => {
    process.env.PI_CODING_AGENT_DIR = "/tmp/pi-agent";
    // Matches the layout Pi created in production for
    // CODING_AGENT_SESSIONS_DIR=/home/javier/coding-agent/sessions.
    expect(resolveSessionDir("/home/javier/coding-agent/sessions")).toBe(
      "/tmp/pi-agent/sessions/--home-javier-coding-agent-sessions--",
    );
    expect(resolveSessionDir("/home/javier/coding-agent/sessions/subagents")).toBe(
      "/tmp/pi-agent/sessions/--home-javier-coding-agent-sessions-subagents--",
    );
  });
});

describe("findSessionFileName", () => {
  it("finds Pi's <timestamp>_<sessionId>.jsonl transcript", () => {
    expect(
      findSessionFileName(
        ["2026-01-02T03-04-05-678Z_s1.jsonl", "2026-01-02T03-04-05-678Z_s2.jsonl"],
        "s2",
      ),
    ).toBe("2026-01-02T03-04-05-678Z_s2.jsonl");
  });

  it("matches the whole session id, not just its suffix", () => {
    expect(
      findSessionFileName(["2026-01-02T03-04-05-678Z_not-s1.jsonl"], "s1"),
    ).toBeUndefined();
  });

  it("accepts a bare <sessionId>.jsonl (explicit session path)", () => {
    expect(findSessionFileName(["s1.jsonl"], "s1")).toBe("s1.jsonl");
  });

  it("returns the newest transcript when the id has several files", () => {
    expect(
      findSessionFileName(
        ["2026-01-01T00-00-00-000Z_s1.jsonl", "2026-01-02T00-00-00-000Z_s1.jsonl"],
        "s1",
      ),
    ).toBe("2026-01-02T00-00-00-000Z_s1.jsonl");
  });

  it("ignores entries that are not session transcripts", () => {
    expect(findSessionFileName(["s1.jsonl.tmp", "notes.txt"], "s1")).toBeUndefined();
  });
});
