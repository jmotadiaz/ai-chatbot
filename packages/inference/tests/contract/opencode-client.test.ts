import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOpencodeClients } from "../../src/clients/opencode";

interface CapturedCall {
  url: string;
  method: string | undefined;
  headers: Headers;
}

const okChatCompletionsBody = JSON.stringify({
  choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
});

// The Responses-flavored client (opencodeGoResponses) speaks a different wire
// format (`response.output`, not `choices`).
const okResponsesApiBody = JSON.stringify({ output: [] });

const callOptions = {
  prompt: [
    { role: "user" as const, content: [{ type: "text" as const, text: "ping" }] },
  ],
};

/** A base `fetch` double that records every call and replays canned statuses in order, repeating the last one once exhausted. */
function makeFetchDouble(statuses: number[]) {
  const calls: CapturedCall[] = [];
  let attempt = 0;
  const fetchDouble = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method, headers: new Headers(init?.headers) });
    const status = statuses[Math.min(attempt, statuses.length - 1)];
    attempt += 1;
    if (status === 200) {
      const body = url.endsWith("/responses") ? okResponsesApiBody : okChatCompletionsBody;
      return new Response(body, { status, headers: { "content-type": "application/json" } });
    }
    return new Response("boom", { status });
  });
  return { fetchDouble, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("OpenCode Go client (contract)", () => {
  it("attaches a stable session header and an ai-chatbot user-agent to every request", async () => {
    // The Responses-flavored client (@ai-sdk/openai) validates key presence
    // before sending, unlike the openai-compatible one used by opencodeGo.
    vi.stubEnv("OPENCODE_ZEN_API_KEY", "test-key");
    const { fetchDouble, calls } = makeFetchDouble([200]);
    vi.stubGlobal("fetch", fetchDouble);

    const { opencodeGo, opencodeGoResponses } = buildOpencodeClients();
    await opencodeGo("deepseek-v4.1-flash").doGenerate(callOptions);
    await opencodeGoResponses("muse-spark-1.3-contributor").doGenerate(callOptions);

    expect(calls).toHaveLength(2);
    const [first, second] = calls;
    expect(first!.url).toBe("https://opencode.ai/zen/go/v1/chat/completions");
    expect(first!.headers.get("user-agent")).toMatch(/^ai-chatbot\/1\.0/);
    expect(first!.headers.get("x-opencode-session")).toBeTruthy();
    // Same kit build shares one session id across every OpenCode-flavored kind.
    expect(second!.headers.get("x-opencode-session")).toBe(
      first!.headers.get("x-opencode-session"),
    );
  });

  it("retries a transient 5xx with backoff before succeeding", async () => {
    const { fetchDouble, calls } = makeFetchDouble([500, 500, 200]);
    vi.stubGlobal("fetch", fetchDouble);

    const { opencodeGo } = buildOpencodeClients();
    const result = await opencodeGo("deepseek-v4.1-flash").doGenerate(callOptions);

    expect(calls).toHaveLength(3);
    expect(result.content[0]).toEqual({ type: "text", text: "ok" });
  });

  it("gives up after exhausting retries", async () => {
    const { fetchDouble, calls } = makeFetchDouble([500, 500, 500, 500, 500]);
    vi.stubGlobal("fetch", fetchDouble);

    const { opencodeGo } = buildOpencodeClients();
    await expect(opencodeGo("deepseek-v4.1-flash").doGenerate(callOptions)).rejects.toThrow();
    // Default retries = 3: first attempt + 3 retries = 4 calls, then no more.
    expect(calls).toHaveLength(4);
  });

  it("does not retry OpenCode Zen (matches today's asymmetry: no fetch override there)", async () => {
    const { fetchDouble, calls } = makeFetchDouble([500, 200]);
    vi.stubGlobal("fetch", fetchDouble);

    const { opencodeZen } = buildOpencodeClients();
    await expect(opencodeZen("some-model").doGenerate(callOptions)).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});
