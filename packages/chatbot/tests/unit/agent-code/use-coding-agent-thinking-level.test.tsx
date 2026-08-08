// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCodingAgentSessionThinkingLevel } from "@/lib/features/code/hooks/use-coding-agent-session-thinking-level";

const okJson = (data: unknown) => async () => data;

describe("useCodingAgentSessionThinkingLevel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: okJson({ thinking: { level: "high", levels: ["off", "high", "xhigh"] } }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the level and available levels for the session", async () => {
    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({ sessionId: "s1", modelId: "Deepseek v4 Pro", enabled: true, isRunning: false }),
    );

    await waitFor(() => expect(result.current.level).toBe("high"));
    expect(result.current.levels).toEqual(["off", "high", "xhigh"]);
    expect(result.current.isLoading).toBe(false);
    expect(fetch).toHaveBeenCalledWith("/api/agent/code/sessions/s1/thinking-level");
  });

  it("refetches when the model changes", async () => {
    const fetchMock = vi.mocked(fetch);
    const { rerender } = renderHook(
      ({ modelId }) =>
        useCodingAgentSessionThinkingLevel({ sessionId: "s1", modelId, enabled: true, isRunning: false }),
      { initialProps: { modelId: "Deepseek v4 Pro" } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ modelId: "Kimi K2.7 Code" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("refetches when a run completes (isRunning true→false)", async () => {
    const fetchMock = vi.mocked(fetch);
    const { rerender } = renderHook(
      ({ isRunning }) =>
        useCodingAgentSessionThinkingLevel({ sessionId: "s1", modelId: "Deepseek v4 Pro", enabled: true, isRunning }),
      { initialProps: { isRunning: true } },
    );
    // Initial load while the run is in flight.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ isRunning: false });
    // Falling edge triggers a refetch so the worker-applied default shows up.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/agent/code/sessions/s1/thinking-level");
  });

  it("ignores a stale GET that resolves after a newer load already applied state", async () => {
    const fetchMock = vi.mocked(fetch);
    let resolveStale!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveStale = resolve;
        }),
    );
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: okJson({ thinking: { level: "xhigh", levels: ["off", "high", "xhigh"] } }),
    } as unknown as Response);

    const { result, rerender } = renderHook(
      ({ modelId }) =>
        useCodingAgentSessionThinkingLevel({ sessionId: "s1", modelId, enabled: true, isRunning: false }),
      { initialProps: { modelId: "Deepseek v4 Pro" } },
    );
    // First load (old model) is still in flight when the model changes.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ modelId: "Kimi K2.7 Code" });
    await waitFor(() => expect(result.current.level).toBe("xhigh"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The slow old-model response lands late: it must not clobber the state.
    await act(async () => {
      resolveStale({
        ok: true,
        json: okJson({ thinking: { level: "low", levels: ["off", "low"] } }),
      } as unknown as Response);
    });

    expect(result.current.level).toBe("xhigh");
    expect(result.current.levels).toEqual(["off", "high", "xhigh"]);
    expect(result.current.isLoading).toBe(false);
  });

  it("stays idle while disabled or without a model", () => {
    const fetchMock = vi.mocked(fetch);
    renderHook(() =>
      useCodingAgentSessionThinkingLevel({ sessionId: "s1", modelId: null, enabled: true, isRunning: false }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs the level and adopts the effective level", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: okJson({ thinking: { level: "high", levels: ["off", "high", "xhigh"] } }),
    } as unknown as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: okJson({ thinking: { level: "xhigh" } }),
    } as unknown as Response);

    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({ sessionId: "s1", modelId: "Deepseek v4 Pro", enabled: true, isRunning: false }),
    );
    await waitFor(() => expect(result.current.level).toBe("high"));

    await act(async () => {
      await result.current.setLevel("xhigh");
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/agent/code/sessions/s1/thinking-level",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ level: "xhigh" }),
      }),
    );
    expect(result.current.level).toBe("xhigh");
  });
});
