// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCodingAgentSessionModel } from "@/lib/features/code/hooks/use-coding-agent-session-model";

const okJson = (data: unknown) => async () => data;

describe("useCodingAgentSessionModel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: okJson({ modelId: "Deepseek v4 Pro" }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the session model and exposes isLoading", async () => {
    const { result } = renderHook(() =>
      useCodingAgentSessionModel({ sessionId: "s1", fallbackModelId: "Fallback" }),
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.modelId).toBe("Deepseek v4 Pro"));
    expect(result.current.isLoading).toBe(false);
    expect(fetch).toHaveBeenCalledWith("/api/agent/code/sessions/s1/model");
  });

  it("falls back to the fallback model when the fetch fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as unknown as Response);

    const { result } = renderHook(() =>
      useCodingAgentSessionModel({ sessionId: "s1", fallbackModelId: "Fallback" }),
    );

    await waitFor(() => expect(result.current.modelId).toBe("Fallback"));
    expect(result.current.isLoading).toBe(false);
  });

  it("exposes a plain local setModelId", () => {
    const { result } = renderHook(() =>
      useCodingAgentSessionModel({ sessionId: "s1", fallbackModelId: "Fallback" }),
    );

    expect(typeof result.current.setModelId).toBe("function");
  });
});
