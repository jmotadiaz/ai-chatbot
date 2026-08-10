/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupMswServer } from "../../helpers/msw-server";
import { useCodingAgentPrompts } from "@/lib/features/code/hooks/use-coding-agent-prompts";
import type { PromptSummary, SessionSummary } from "@/lib/features/code/worker-client";

const server = setupMswServer();

describe("useCodingAgentPrompts", () => {
  it("loads prompts and labeled sessions from the API", async () => {
    const prompts: PromptSummary[] = [
      { name: "code-review-session", description: "Review a session", inputs: [] },
    ];
    const sessions: SessionSummary[] = [{ sessionId: "s1", label: "Session A" }];
    server.use(
      http.get("*/api/agent/code/sessions/s1/prompts", () =>
        HttpResponse.json({ prompts, sessions }),
      ),
    );

    const { result } = renderHook(() => useCodingAgentPrompts("s1", true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.prompts).toEqual(prompts);
    expect(result.current.sessions).toEqual(sessions);
    expect(result.current.error).toBeNull();
  });

  it("falls back to empty arrays and sets an error when the request fails", async () => {
    server.use(
      http.get("*/api/agent/code/sessions/s1/prompts", () =>
        HttpResponse.error(),
      ),
    );

    const { result } = renderHook(() => useCodingAgentPrompts("s1", true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.prompts).toEqual([]);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.error).toBe("Prompts could not be loaded.");
  });
});
