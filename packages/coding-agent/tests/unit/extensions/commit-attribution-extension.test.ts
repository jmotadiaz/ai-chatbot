import { describe, expect, it } from "vitest";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type ExtensionAPI,
  type Model,
} from "@earendil-works/pi-coding-agent";
import registerCommitAttributionExtension, {
  buildCommitAttributionPrompt,
} from "../../../extensions/commit-attribution/index";

describe("commit-attribution extension", () => {
  it("builds prompt with given model name", () => {
    const prompt = buildCommitAttributionPrompt("Gemini 3.8 Flash");
    expect(prompt).toContain("## Commit Attribution");
    expect(prompt).toContain("Co-Authored-By: Gemini 3.8 Flash");
    expect(prompt).not.toContain("<");
  });

  it("falls back to AI Assistant when model name is missing", () => {
    const prompt = buildCommitAttributionPrompt(undefined);
    expect(prompt).toContain("Co-Authored-By: AI Assistant");
    expect(prompt).not.toContain("<");
  });

  it("injects attribution into system prompt on turn via before_agent_start", async () => {
    const dummyModel: Model<any> = {
      id: "deepseek-v4.1-flash",
      name: "Deepseek v4.1 Flash",
      provider: "model-gateway",
      api: "openai-completions",
      baseUrl: "http://127.0.0.1:4000/v1",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
    };

    const resourceLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: "/tmp",
      noSkills: true,
      extensionFactories: [registerCommitAttributionExtension as (pi: ExtensionAPI) => void],
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: process.cwd(),
      agentDir: "/tmp",
      resourceLoader,
      sessionManager: SessionManager.inMemory(process.cwd()),
      model: dummyModel,
      noTools: "all",
    });

    await session.bindExtensions({ mode: "rpc" });

    // Initial systemPrompt before prompt() has base prompt only (does not contain the dynamic trailer)
    expect(session.systemPrompt).not.toContain("Co-Authored-By: Deepseek v4.1 Flash");

    // Stub auth check so session.prompt() passes auth validation and invokes before_agent_start
    const modelRuntime = (session as any).modelRuntime;
    if (modelRuntime) {
      modelRuntime.hasConfiguredAuth = () => true;
      modelRuntime.checkAuth = async () => "dummy-key";
    }

    try {
      await session.prompt("Initial message");
    } catch {
      // Expected to fail streaming without real network, but before_agent_start runs before streaming
    }

    expect(session.systemPrompt).toContain("## Commit Attribution");
    expect(session.systemPrompt).toContain("Co-Authored-By: Deepseek v4.1 Flash\n```");

    session.dispose();
  });
});
