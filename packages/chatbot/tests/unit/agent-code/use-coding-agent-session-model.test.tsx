// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
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

  it("POSTs the model optimistically and clears isApplying", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: okJson({ modelId: "Deepseek v4 Pro" }),
    } as unknown as Response);
    let resolvePost!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolvePost = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useCodingAgentSessionModel({ sessionId: "s1", fallbackModelId: "Fallback" }),
    );
    await waitFor(() => expect(result.current.modelId).toBe("Deepseek v4 Pro"));

    const pending = result.current.setModelId("Kimi K2.7 Code");
    await act(async () => {});

    // Optimistic update is visible and isApplying stays true while the
    // POST is still in flight.
    expect(result.current.modelId).toBe("Kimi K2.7 Code");
    expect(result.current.isApplying).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/agent/code/sessions/s1/model",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: "Kimi K2.7 Code" }),
      }),
    );

    await act(async () => {
      resolvePost({ ok: true, json: okJson({ modelId: "Kimi K2.7 Code" }) } as unknown as Response);
      await pending;
    });

    expect(result.current.modelId).toBe("Kimi K2.7 Code");
    expect(result.current.isApplying).toBe(false);
  });

  it("reverts to the previous model when the POST fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: okJson({ modelId: "Deepseek v4 Pro" }),
    } as unknown as Response);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as unknown as Response);

    const { result } = renderHook(() =>
      useCodingAgentSessionModel({ sessionId: "s1", fallbackModelId: "Fallback" }),
    );
    await waitFor(() => expect(result.current.modelId).toBe("Deepseek v4 Pro"));

    await act(async () => {
      await result.current.setModelId("Kimi K2.7 Code");
    });

    expect(result.current.modelId).toBe("Deepseek v4 Pro");
    expect(result.current.isApplying).toBe(false);
  });

  it("ignores a stale pick's revert and isApplying cleanup when a newer pick wins", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: okJson({ modelId: "Deepseek v4 Pro" }),
    } as unknown as Response);
    let rejectA!: (reason: Error) => void;
    let resolveB!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((_, reject) => {
          rejectA = reject;
        }),
    );
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveB = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useCodingAgentSessionModel({ sessionId: "s1", fallbackModelId: "Fallback" }),
    );
    await waitFor(() => expect(result.current.modelId).toBe("Deepseek v4 Pro"));

    // Pick A (captured from the render before its optimistic state lands).
    const pickA = result.current.setModelId("Kimi K2.7 Code");
    await act(async () => {});
    expect(result.current.modelId).toBe("Kimi K2.7 Code");
    expect(result.current.isApplying).toBe(true);

    // Pick B starts while A is still in flight.
    const pickB = result.current.setModelId("Qwen 3.7 Plus");
    await act(async () => {});
    expect(result.current.modelId).toBe("Qwen 3.7 Plus");
    expect(result.current.isApplying).toBe(true);

    // B succeeds first: state settles on B and isApplying clears.
    await act(async () => {
      resolveB({
        ok: true,
        json: okJson({ modelId: "Qwen 3.7 Plus" }),
      } as unknown as Response);
      await pickB;
    });
    expect(result.current.modelId).toBe("Qwen 3.7 Plus");
    expect(result.current.isApplying).toBe(false);

    // A fails afterwards: its stale catch must not revert to pre-A and its
    // stale finally must not touch isApplying (B's falling-edge refetch in
    // the layout depends on that flag staying clear).
    await act(async () => {
      rejectA(new Error("boom"));
      await pickA;
    });
    expect(result.current.modelId).toBe("Qwen 3.7 Plus");
    expect(result.current.isApplying).toBe(false);
  });
});
