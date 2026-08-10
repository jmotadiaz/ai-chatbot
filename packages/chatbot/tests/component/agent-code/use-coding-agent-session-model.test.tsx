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
});
