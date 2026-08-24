import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PACKAGE_ROOT } from "../../src/paths";

vi.mock("tracing", () => ({
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const superpowersExtension = (
  await import("../../extensions/superpowers/index")
).default;

type Handler = (event: unknown) => Promise<unknown>;
type Message = { role: string; content: unknown };

/** Minimal ExtensionAPI double: records handlers so tests can fire them. */
function bindExtension() {
  const handlers = new Map<string, Handler>();
  const pi = {
    on: (event: string, handler: Handler) => {
      handlers.set(event, handler);
    },
  } as unknown as ExtensionAPI;

  superpowersExtension(pi);

  const fire = async (event: string, payload: unknown = {}) =>
    handlers.get(event)?.(payload);

  return {
    handlers,
    fire,
    context: async (messages: Message[]) =>
      (await fire("context", { type: "context", messages })) as
        | { messages: Message[] }
        | undefined,
  };
}

function textOf(message: Message | undefined): string {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part as { text?: string }).text ?? "")
    .join("");
}

const userMessage = (text: string): Message => ({
  role: "user",
  content: [{ type: "text", text }],
});

describe("superpowers extension", () => {
  it("registers the vendored skills directory via resources_discover", async () => {
    const { fire } = bindExtension();

    const result = (await fire("resources_discover")) as {
      skillPaths: string[];
    };

    expect(result.skillPaths).toEqual([
      join(PACKAGE_ROOT, "extensions", "superpowers", "skills"),
    ]);
  });

  it("prepends the bootstrap as a user message at the head of the context", async () => {
    const { context } = bindExtension();

    const result = await context([userMessage("hola")]);

    expect(result?.messages).toHaveLength(2);
    const bootstrap = result?.messages[0];
    expect(bootstrap?.role).toBe("user");
    const text = textOf(bootstrap);
    expect(text).toContain("<EXTREMELY_IMPORTANT>");
    expect(text).toContain("superpowers:using-superpowers bootstrap for pi");
    expect(text).toContain("You have superpowers.");
    expect(textOf(result?.messages[1])).toBe("hola");
  });

  it("keeps compaction summaries at the head and injects right after them", async () => {
    const { context } = bindExtension();

    const result = await context([
      { role: "compactionSummary", content: "summary" },
      userMessage("hola"),
    ]);

    expect(result?.messages.map((m) => m.role)).toEqual([
      "compactionSummary",
      "user",
      "user",
    ]);
    expect(textOf(result?.messages[1])).toContain("You have superpowers.");
  });

  it("still injects when a tool result quotes the bootstrap marker", async () => {
    // The agent reading this extension's own source pulls the marker into the
    // history. Upstream's "already injected?" guard would trip on that and
    // silently drop the bootstrap for the rest of the session; there is no
    // such guard here, because the transformed list is thrown away after each
    // request and a previous injection is undetectable by construction.
    const { context } = bindExtension();

    const result = await context([
      userMessage("lee extensions/superpowers/index.ts"),
      {
        role: "toolResult",
        content: [
          {
            type: "text",
            text: 'const BOOTSTRAP_MARKER = "superpowers:using-superpowers bootstrap for pi";',
          },
        ],
      },
    ]);

    expect(result?.messages).toHaveLength(3);
    expect(textOf(result?.messages[0])).toContain("You have superpowers.");
  });

  it("keeps injecting on every turn, including after agent_end", async () => {
    // Upstream disarms on `agent_end` and leaves turn two onwards to the model
    // loading the using-superpowers skill by itself. The harness does not: the
    // bootstrap must ride every call.
    const { fire, context } = bindExtension();

    expect(await context([userMessage("turno 1")])).toBeDefined();

    await fire("agent_end");
    expect(await context([userMessage("turno 2")])).toBeDefined();

    await fire("agent_end");
    expect(await context([userMessage("turno 3")])).toBeDefined();
  });

  it("registers no session lifecycle handlers to gate the injection", async () => {
    const { handlers } = bindExtension();

    expect(handlers.has("session_start")).toBe(false);
    expect(handlers.has("session_compact")).toBe(false);
    expect(handlers.has("agent_end")).toBe(false);
  });

  it("does not append the bootstrap to the system prompt", async () => {
    const { handlers } = bindExtension();

    expect(handlers.has("before_agent_start")).toBe(false);
  });
});
