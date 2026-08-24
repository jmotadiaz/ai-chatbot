import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { getExtensionPaths, getFirstPartySkillPathsFiltered } = await import(
  "../../src/pi-packages"
);

/**
 * End-to-end check of the bootstrap channel: the extension is loaded by the
 * real SDK and its `context` handler must reach `agent.transformContext`,
 * which `@earendil-works/pi-agent-core` applies before every provider call.
 * A directory-shaped extension path (or a dead `context` event) would leave
 * `transformContext` a no-op, which is exactly the regression this guards.
 */
describe("superpowers bootstrap injection (real SDK wiring)", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `superpowers-bootstrap-${crypto.randomUUID()}`);
    mkdirSync(tmpRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  async function bindSession(options?: { includeSuperpowersExtension?: boolean }) {
    const agentDir = join(tmpRoot, "agent");
    const cwd = join(tmpRoot, "project");
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(cwd, { recursive: true });

    const loaderOptions = {
      includeSubagentExtension: false,
      includeSuperpowersExtension: options?.includeSuperpowersExtension ?? true,
    };
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      additionalExtensionPaths: getExtensionPaths(loaderOptions),
      additionalSkillPaths: getFirstPartySkillPathsFiltered(loaderOptions),
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd,
      agentDir,
      resourceLoader,
      sessionManager: SessionManager.inMemory(cwd),
      noTools: "all",
    });
    await session.bindExtensions({ mode: "rpc" });
    return session;
  }

  const userMessage = (text: string) => ({
    role: "user" as const,
    content: [{ type: "text" as const, text }],
    timestamp: 0,
  });

  function textOf(message: { content?: unknown } | undefined): string {
    const content = message?.content;
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content.map((part) => (part as { text?: string }).text ?? "").join("");
  }

  it("prepends the bootstrap through agent.transformContext", async () => {
    const session = await bindSession();

    const transformed = await session.agent.transformContext?.([
      userMessage("hola"),
    ]);

    expect(transformed).toHaveLength(2);
    expect(textOf(transformed?.[0])).toContain("You have superpowers.");
    expect(textOf(transformed?.[0])).toContain("<EXTREMELY_IMPORTANT>");
    expect(textOf(transformed?.[1])).toBe("hola");

    // The bootstrap is context-only: it must never leak into the system prompt.
    expect(session.systemPrompt ?? "").not.toContain("You have superpowers.");

    session.dispose();
  });

  it("does not inject for runtimes that exclude the extension (subagents)", async () => {
    const session = await bindSession({ includeSuperpowersExtension: false });

    const transformed = await session.agent.transformContext?.([
      userMessage("hola"),
    ]);

    expect(transformed).toHaveLength(1);
    expect(textOf(transformed?.[0])).toBe("hola");

    session.dispose();
  });
});
