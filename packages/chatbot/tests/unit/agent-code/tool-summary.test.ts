import { describe, it, expect } from "vitest";
import {
  summarizeToolCall,
  describeToolCall,
  compactPath,
  cleanBashCommand,
  truncate,
} from "@/lib/features/code/tool-summary";

describe("compactPath", () => {
  it("relativizes monorepo package paths and elides intermediate segments", () => {
    expect(
      compactPath("packages/chatbot/components/code/tool-call-group.tsx"),
    ).toBe("chatbot/…/code/tool-call-group.tsx");
  });

  it("strips absolute project directory prefix when project is supplied", () => {
    expect(
      compactPath(
        "/home/javier/projects/ai-chatbot/packages/chatbot/components/code/tool-call-group.tsx",
        { project: "ai-chatbot" },
      ),
    ).toBe("chatbot/…/code/tool-call-group.tsx");
  });

  it("handles relative path starting with project name", () => {
    expect(
      compactPath(
        "ai-chatbot/packages/chatbot/components/code/tool-call-group.tsx",
        { project: "ai-chatbot" },
      ),
    ).toBe("chatbot/…/code/tool-call-group.tsx");
  });

  it("strips worktree directory when project is supplied", () => {
    expect(
      compactPath(
        "/home/javier/projects/ai-chatbot/.worktrees/feature-x/packages/chatbot/components/code/tool-call-group.tsx",
        { project: "ai-chatbot" },
      ),
    ).toBe("chatbot/…/code/tool-call-group.tsx");
  });

  it("strips worktree directory without project option", () => {
    expect(
      compactPath(
        ".worktrees/feature-x/packages/chatbot/components/code/tool-call-group.tsx",
      ),
    ).toBe("chatbot/…/code/tool-call-group.tsx");
  });

  it("keeps 3 tail segments when penultimate segment is dynamic App Router parameter", () => {
    expect(
      compactPath(
        "packages/chatbot/app/(chat)/agent/code/[project]/artifacts/[artifact]/route.ts",
      ),
    ).toBe("chatbot/…/artifacts/[artifact]/route.ts");
  });

  it("preserves short paths with 3 segments without elision", () => {
    expect(compactPath("packages/config/src/index.ts")).toBe(
      "config/src/index.ts",
    );
  });

  it("normalizes vendored skills path and elides deep paths", () => {
    expect(compactPath(".agents/skills/archify/SKILL.md")).toBe(
      "skills/archify/SKILL.md",
    );
    expect(
      compactPath(".agents/skills/archify/references/delivery-contract.md"),
    ).toBe("skills/…/references/delivery-contract.md");
  });

  it("normalizes scratch directory paths", () => {
    expect(
      compactPath(".scratch/tool-presentation-prototypes/index.html"),
    ).toBe(".scratch/tool-presentation-prototypes/index.html");
    expect(compactPath(".scratch/a/b/c/d.html")).toBe(".scratch/…/c/d.html");
  });

  it("leaves external paths unchanged if segments <= 3", () => {
    expect(
      compactPath("/tmp/artifacts/diagram.html", { project: "ai-chatbot" }),
    ).toBe("/tmp/artifacts/diagram.html");
  });

  it("does not strip packages from external paths when project is supplied", () => {
    expect(
      compactPath("/opt/packages/main.deb", { project: "ai-chatbot" }),
    ).toBe("/opt/packages/main.deb");
    expect(
      compactPath("/var/cache/packages/main.deb", { project: "ai-chatbot" }),
    ).toBe("/var/…/packages/main.deb");
  });

  it("formats offset and limit as :start–end range with en-dash", () => {
    expect(
      compactPath("packages/chatbot/lib/features/code/tool-summary.ts", {
        offset: 35,
        limit: 60,
      }),
    ).toBe("chatbot/…/code/tool-summary.ts:35–95");
  });

  it("accepts string offset and limit numbers", () => {
    expect(
      compactPath("packages/chatbot/lib/features/code/tool-summary.ts", {
        offset: "35",
        limit: "60",
      }),
    ).toBe("chatbot/…/code/tool-summary.ts:35–95");
  });

  it("formats offset only when limit is omitted", () => {
    expect(
      compactPath("packages/chatbot/lib/features/code/tool-summary.ts", {
        offset: 35,
      }),
    ).toBe("chatbot/…/code/tool-summary.ts:35");
  });

  it("ignores zero or negative offset", () => {
    expect(
      compactPath("packages/chatbot/lib/features/code/tool-summary.ts", {
        offset: 0,
        limit: 10,
      }),
    ).toBe("chatbot/…/code/tool-summary.ts");
    expect(
      compactPath("packages/chatbot/lib/features/code/tool-summary.ts", {
        offset: -5,
      }),
    ).toBe("chatbot/…/code/tool-summary.ts");
  });

  it("normalizes windows backslashes to forward slashes", () => {
    expect(
      compactPath("packages\\chatbot\\components\\code\\tool-call-group.tsx"),
    ).toBe("chatbot/…/code/tool-call-group.tsx");
  });

  it("returns empty string for empty input", () => {
    expect(compactPath("")).toBe("");
    expect(compactPath(undefined as unknown as string)).toBe("");
  });
});

describe("cleanBashCommand", () => {
  it("strips cd directory prefix with &&", () => {
    expect(cleanBashCommand("cd /repo && pnpm test")).toBe("pnpm test");
    expect(cleanBashCommand("cd '/path with spaces' && pnpm test")).toBe(
      "pnpm test",
    );
    expect(cleanBashCommand('cd "/path with spaces" && pnpm test')).toBe(
      "pnpm test",
    );
  });

  it("takes the first non-comment line for scripts", () => {
    expect(cleanBashCommand("# run test suite\n# second line\npnpm test")).toBe(
      "pnpm test",
    );
  });

  it("preserves heredoc header line and redirection target", () => {
    expect(
      cleanBashCommand("cat << 'EOF' > file.txt\nline 1\nline 2\nEOF"),
    ).toBe("cat << 'EOF' > file.txt");
    expect(
      cleanBashCommand("python3 - << 'EOF'\nprint('hello')\nEOF"),
    ).toBe("python3 - << 'EOF'");
  });

  it("collapses internal whitespace", () => {
    expect(cleanBashCommand("  echo    hello     world  ")).toBe(
      "echo hello world",
    );
  });
});

describe("summarizeToolCall", () => {
  it("returns the command for bash", () => {
    expect(summarizeToolCall("bash", { command: "ls -la" })).toBe("ls -la");
  });

  it("cleans cd prefix and comments for bash", () => {
    expect(
      summarizeToolCall("bash", { command: "cd /app && pnpm build:verify" }),
    ).toBe("pnpm build:verify");
  });

  it("falls back to cmd for shell", () => {
    expect(summarizeToolCall("shell", { cmd: "echo hi" })).toBe("echo hi");
  });

  it("returns compacted path for read", () => {
    expect(
      summarizeToolCall("read", {
        path: "packages/chatbot/components/code/tool-call-group.tsx",
      }),
    ).toBe("chatbot/…/code/tool-call-group.tsx");
  });

  it("includes line range in read summary when offset and limit are provided", () => {
    expect(
      summarizeToolCall("read", {
        path: "packages/chatbot/lib/features/code/tool-summary.ts",
        offset: 35,
        limit: 60,
      }),
    ).toBe("chatbot/…/code/tool-summary.ts:35–95");
  });

  it("returns compacted path for write and edit", () => {
    expect(
      summarizeToolCall("write", {
        path: "packages/chatbot/components/code/tool-call-group.tsx",
      }),
    ).toBe("chatbot/…/code/tool-call-group.tsx");
    expect(
      summarizeToolCall("edit", {
        path: "packages/chatbot/components/code/tool-call-group.tsx",
      }),
    ).toBe("chatbot/…/code/tool-call-group.tsx");
  });

  it("combines pattern and compacted path for grep", () => {
    expect(
      summarizeToolCall("grep", {
        pattern: "TODO",
        path: "packages/chatbot/lib/features/code/tool-summary.ts",
      }),
    ).toBe("TODO in chatbot/…/code/tool-summary.ts");
  });

  it("returns the path for find and ls", () => {
    expect(summarizeToolCall("find", { path: "/usr" })).toBe("/usr");
    expect(summarizeToolCall("ls", { path: "/" })).toBe("/");
  });

  it("prefers pattern over path for find", () => {
    expect(summarizeToolCall("find", { pattern: "*.ts", path: "/src" })).toBe(
      "*.ts",
    );
  });

  it("summarizes publish_artifact with name", () => {
    expect(
      summarizeToolCall("publish_artifact", {
        name: "architecture-review",
        path: "/tmp/review.html",
      }),
    ).toBe("architecture-review");
  });

  it("falls back to compacted path for publish_artifact without name", () => {
    expect(
      summarizeToolCall("publish_artifact", {
        path: "packages/chatbot/report.html",
      }),
    ).toBe("chatbot/report.html");
  });

  it("truncates long strings with ellipsis", () => {
    const long = "x".repeat(200);
    expect(summarizeToolCall("bash", { command: long })).toBe(
      `${"x".repeat(80)}…`,
    );
  });

  it("extracts prioritized scalar for unknown tools", () => {
    expect(
      summarizeToolCall("custom_tool", { description: "Build and deploy" }),
    ).toBe("Build and deploy");
    expect(summarizeToolCall("custom_tool", { query: "SELECT 1" })).toBe(
      "SELECT 1",
    );
  });

  it("falls back to JSON.stringify for unknown tools without prioritized scalar", () => {
    expect(summarizeToolCall("magic", { foo: 1 })).toBe('{"foo":1}');
  });

  it("handles missing args gracefully", () => {
    expect(summarizeToolCall("bash", undefined)).toBe("");
    expect(summarizeToolCall("read", null)).toBe("");
  });

  it("extracts streaming rawArgs when args object is not yet parsed", () => {
    expect(
      summarizeToolCall("bash", undefined, {
        rawArgs: '{"command":"pnpm build:verify',
      }),
    ).toBe("pnpm build:verify");
    expect(
      summarizeToolCall("read", undefined, {
        rawArgs: '{"path":"packages/config/src/index.ts"',
      }),
    ).toBe("config/src/index.ts");
    expect(
      summarizeToolCall("publish_artifact", undefined, {
        rawArgs: '{"name":"architecture-review"',
      }),
    ).toBe("architecture-review");
  });

  it("prefers description for subagent", () => {
    expect(
      summarizeToolCall("subagent", {
        description: "Explore auth flow",
        task: "do x",
      }),
    ).toBe("Explore auth flow");
  });

  it("falls back to the first task line for subagent", () => {
    expect(
      summarizeToolCall("subagent", { task: "First line\nSecond line" }),
    ).toBe("First line");
  });
});

describe("describeToolCall", () => {
  it("provides uncompacted path in title when path was compacted", () => {
    const desc = describeToolCall("read", {
      path: "packages/chatbot/components/code/tool-call-group.tsx",
      offset: 35,
      limit: 60,
    });
    expect(desc.summary).toBe("chatbot/…/code/tool-call-group.tsx:35–95");
    expect(desc.title).toBe(
      "packages/chatbot/components/code/tool-call-group.tsx:35–95",
    );
  });

  it("provides full untruncated command in title for bash", () => {
    const long = "pnpm test -- " + "a".repeat(100);
    const desc = describeToolCall("bash", { command: long });
    expect(desc.summary.endsWith("…")).toBe(true);
    expect(desc.title).toBe(long);
  });

  it("omits title when summary is identical to raw content", () => {
    const desc = describeToolCall("bash", { command: "ls" });
    expect(desc.summary).toBe("ls");
    expect(desc.title).toBeUndefined();
  });
});

describe("truncate", () => {
  it("preserves short string", () => {
    expect(truncate("hello")).toBe("hello");
  });

  it("truncates at max with ellipsis", () => {
    expect(truncate("hello world", 5)).toBe("hello…");
  });
});
