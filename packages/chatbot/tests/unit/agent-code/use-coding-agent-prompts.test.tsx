// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCodingAgentPrompts } from "@/lib/features/code/hooks/use-coding-agent-prompts";
import type { PromptSummary, SessionSummary } from "@/lib/features/code/worker-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCodingAgentPrompts", () => {
  it("loads prompts and labeled sessions from the API", async () => {
    const prompts: PromptSummary[] = [
      { name: "code-review-session", description: "Review a session", inputs: [] },
    ];
    const sessions: SessionSummary[] = [{ sessionId: "s1", label: "Session A" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ prompts, sessions }),
      })),
    );

    const { result } = renderHook(() => useCodingAgentPrompts("s1", true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.prompts).toEqual(prompts);
    expect(result.current.sessions).toEqual(sessions);
    expect(result.current.error).toBeNull();
  });

  it("falls back to empty arrays and sets an error when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );

    const { result } = renderHook(() => useCodingAgentPrompts("s1", true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.prompts).toEqual([]);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.error).toBe("Prompts could not be loaded.");
  });
});
