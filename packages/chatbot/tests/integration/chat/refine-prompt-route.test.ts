import { afterEach, describe, expect, it, vi } from "vitest";
import { setupGatewayHarness } from "../../helpers/gateway-harness";

const authMock = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/features/auth/auth-config", () => ({
  auth: authMock.auth,
}));

const { POST } = await import("@/app/(chat)/api/refine-prompt/route");

/**
 * POST /api/refine-prompt (ticket 08). The browser E2E only asserted the
 * client round trip against a stubbed route; this exercises the real handler
 * with the Gateway at the HTTP seam, so the request the Gateway receives and
 * the text the client gets back are both checked.
 */
describe("POST /api/refine-prompt", () => {
  const gateway = setupGatewayHarness();

  afterEach(() => {
    authMock.auth.mockReset();
  });

  function refineRequest(text: string) {
    return new Request("http://localhost/api/refine-prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: { role: "user", parts: [{ type: "text", text }] },
        messages: [],
        mode: "chat",
      }),
    });
  }

  it("rejects requests without a session", async () => {
    authMock.auth.mockResolvedValue(null);

    const response = await POST(refineRequest("hello world"));

    expect(response.status).toBe(401);
  });

  it("returns the refined prompt produced by the reasoning model", async () => {
    authMock.auth.mockResolvedValue({ user: { id: "user-1" } });
    const scenario = await gateway.use({
      chat: () => ({ steps: [{ delta: { content: "Refined: hello world" } }] }),
    });

    const response = await POST(refineRequest("hello world"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "Refined: hello world" });
    const inference = scenario.requests.filter(
      (request) => request.path === "/v1/chat/completions",
    );
    expect(inference).toHaveLength(1);
    expect(JSON.stringify(inference[0]!.body)).toContain("hello world");
  });
});
