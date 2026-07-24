import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const {
  __resetSessionsForTests,
  __seedSessionForTests,
  getSessionSkills,
  sendPrompt,
} = await import("coding-agent/session-manager");
const { SessionEventLog } = await import("coding-agent/event-log");

beforeEach(() => {
  __resetSessionsForTests();
});

describe("session-manager skills", () => {
  it("expands every leading skill while preserving their order", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "coding-agent-skills-"));
    const firstPath = join(baseDir, "code-review.md");
    const secondPath = join(baseDir, "find-docs.md");
    writeFileSync(
      firstPath,
      "---\nname: code-review\ndescription: Review code\n---\nReview instructions",
    );
    writeFileSync(
      secondPath,
      "---\nname: find-docs\ndescription: Find docs\n---\nDocs instructions",
    );
    const skills = [
      {
        name: "code-review",
        description: "Review code",
        filePath: firstPath,
        baseDir,
      },
      {
        name: "find-docs",
        description: "Find docs",
        filePath: secondPath,
        baseDir,
      },
    ];
    const prompt = vi.fn((_text: string) => Promise.resolve());
    const session = {
      messages: [],
      isStreaming: false,
      subscribe: vi.fn(() => () => {}),
      prompt,
      resourceLoader: { getSkills: () => ({ skills, diagnostics: [] }) },
    };
    __seedSessionForTests("skills-1", {
      sessionId: "skills-1",
      piSessionId: "pi-skills-1",
      project: "p",
      runtime: { session } as never,
      eventLog: new SessionEventLog(),
    });

    const stream = await sendPrompt(
      "skills-1",
      "/skill:code-review /skill:find-docs\n\nReview this",
      [
        {
          id: "u1",
          role: "user",
          content:
            "/skill:code-review /skill:find-docs\n\nReview this",
        },
      ],
      "r1",
    );
    await stream.cancel();

    const expanded = prompt.mock.calls[0]![0] as string;
    expect(expanded).toContain('<skill name="code-review"');
    expect(expanded).toContain("Review instructions");
    expect(expanded).toContain('<skill name="find-docs"');
    expect(expanded).toContain("Docs instructions");
    expect(expanded).toMatch(/<\/skill>\n\nReview this$/);
    expect(expanded.indexOf("code-review")).toBeLessThan(
      expanded.indexOf("find-docs"),
    );
  });

  it("returns the session skills as sorted UI-safe metadata", () => {
    const skills = [
      { name: "zeta", description: "Z", filePath: "/secret/z", baseDir: "/secret" },
      { name: "alpha", description: "A", filePath: "/secret/a", baseDir: "/secret" },
    ];
    __seedSessionForTests("skills-2", {
      sessionId: "skills-2",
      piSessionId: "pi-skills-2",
      project: "p",
      runtime: {
        session: {
          resourceLoader: { getSkills: () => ({ skills, diagnostics: [] }) },
        },
      } as never,
      eventLog: new SessionEventLog(),
    });

    expect(getSessionSkills("skills-2")).toEqual([
      { name: "alpha", description: "A" },
      { name: "zeta", description: "Z" },
    ]);
  });
});
