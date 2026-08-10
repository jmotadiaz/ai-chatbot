/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupMswServer } from "../../helpers/msw-server";
import { useCodingAgentSessionModel } from "@/lib/features/code/hooks/use-coding-agent-session-model";

let requestedUrl: string | null = null;

const server = setupMswServer(
  http.get("*/api/agent/code/sessions/s1/model", ({ request }) => {
    requestedUrl = request.url;
    return HttpResponse.json({ modelId: "Deepseek v4 Pro" });
  }),
);

describe("useCodingAgentSessionModel", () => {
  beforeEach(() => {
    requestedUrl = null;
  });

  it("loads the session model and exposes isLoading", async () => {
    const { result } = renderHook(() =>
      useCodingAgentSessionModel({ sessionId: "s1", fallbackModelId: "Fallback" }),
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.modelId).toBe("Deepseek v4 Pro"));
    expect(result.current.isLoading).toBe(false);
    expect(new URL(requestedUrl!).pathname).toBe(
      "/api/agent/code/sessions/s1/model",
    );
  });

  it("falls back to the fallback model when the fetch fails", async () => {
    server.use(
      http.get(
        "*/api/agent/code/sessions/s1/model",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(() =>
      useCodingAgentSessionModel({ sessionId: "s1", fallbackModelId: "Fallback" }),
    );

    await waitFor(() => expect(result.current.modelId).toBe("Fallback"));
    expect(result.current.isLoading).toBe(false);
  });

  it("uses the server-resolved model without fetching or ever showing a skeleton", async () => {
    const { result } = renderHook(() =>
      useCodingAgentSessionModel({
        sessionId: "s1",
        fallbackModelId: "Fallback",
        initialModelId: "Kimi K2.7 Code",
      }),
    );

    // The picker is usable on the very first render, and so is sending: the
    // whole point of resolving this during the server render.
    expect(result.current.modelId).toBe("Kimi K2.7 Code");
    expect(result.current.isLoading).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requestedUrl).toBeNull();
  });

  it("still fetches when the server could not resolve a model", async () => {
    const { result } = renderHook(() =>
      useCodingAgentSessionModel({
        sessionId: "s1",
        fallbackModelId: "Fallback",
        initialModelId: null,
      }),
    );

    await waitFor(() => expect(result.current.modelId).toBe("Deepseek v4 Pro"));
    expect(requestedUrl).not.toBeNull();
  });
});
