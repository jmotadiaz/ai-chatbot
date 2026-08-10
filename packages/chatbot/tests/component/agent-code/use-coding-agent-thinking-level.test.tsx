/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ThinkingLevel } from "models";
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

  it("seeds the level from the catalog default as soon as the model is known", () => {
    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({
        sessionId: "s1",
        modelId: "Deepseek v4 Pro",
        defaultLevel: "xhigh",
      }),
    );

    // Sin esperar al worker: es lo que hace usable el control en una sesión
    // nueva, antes del primer mensaje.
    expect(result.current.level).toBe("xhigh");
  });

  it("adopts the session's level when the worker already has one", async () => {
    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({
        sessionId: "s1",
        modelId: "Deepseek v4 Pro",
        defaultLevel: "xhigh",
      }),
    );

    await waitFor(() => expect(result.current.level).toBe("high"));
    expect(fetch).toHaveBeenCalledWith("/api/agent/code/sessions/s1/thinking-level");
  });

  it("keeps the catalog default when the worker has no session yet", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: okJson({ thinking: null }),
    } as unknown as Response);

    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({
        sessionId: "s1",
        modelId: "Deepseek v4 Pro",
        defaultLevel: "xhigh",
      }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(result.current.level).toBe("xhigh");
  });

  it("resets to the new model's default when the picker changes, without refetching", async () => {
    const fetchMock = vi.mocked(fetch);
    const { result, rerender } = renderHook(
      ({ modelId, defaultLevel }) =>
        useCodingAgentSessionThinkingLevel({ sessionId: "s1", modelId, defaultLevel }),
      {
        initialProps: {
          modelId: "Deepseek v4 Pro",
          defaultLevel: "xhigh" as ThinkingLevel,
        },
      },
    );
    await waitFor(() => expect(result.current.level).toBe("high"));

    rerender({ modelId: "Kimi K2.7 Code", defaultLevel: "high" as ThinkingLevel });

    expect(result.current.level).toBe("high");
    // El nivel de la sesión es del modelo anterior: no hay nada que volver a
    // pedir, el worker aplicará este default al enviar.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores the initial GET when the user already picked a level", async () => {
    const fetchMock = vi.mocked(fetch);
    let resolveGet!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveGet = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({
        sessionId: "s1",
        modelId: "Deepseek v4 Pro",
        defaultLevel: "xhigh",
      }),
    );

    act(() => result.current.setLevel("low"));

    await act(async () => {
      resolveGet({
        ok: true,
        json: okJson({ thinking: { level: "high", levels: ["off", "high", "xhigh"] } }),
      } as unknown as Response);
    });

    expect(result.current.level).toBe("low");
  });

  it("ignores the initial GET when the model changed while it was in flight", async () => {
    const fetchMock = vi.mocked(fetch);
    let resolveGet!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveGet = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ modelId, defaultLevel }) =>
        useCodingAgentSessionThinkingLevel({ sessionId: "s1", modelId, defaultLevel }),
      {
        initialProps: {
          modelId: "Deepseek v4 Pro",
          defaultLevel: "xhigh" as ThinkingLevel,
        },
      },
    );

    rerender({ modelId: "Kimi K2.7 Code", defaultLevel: "high" as ThinkingLevel });

    await act(async () => {
      resolveGet({
        ok: true,
        json: okJson({ thinking: { level: "xhigh", levels: ["off", "high", "xhigh"] } }),
      } as unknown as Response);
    });

    expect(result.current.level).toBe("high");
  });

  it("does not fetch until the model is known", () => {
    const fetchMock = vi.mocked(fetch);
    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({
        sessionId: "s1",
        modelId: null,
        defaultLevel: "xhigh",
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.level).toBeNull();
  });

  it("sets the level locally, with no request (it travels with the prompt)", async () => {
    const fetchMock = vi.mocked(fetch);
    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({
        sessionId: "s1",
        modelId: "Deepseek v4 Pro",
        defaultLevel: "xhigh",
      }),
    );
    await waitFor(() => expect(result.current.level).toBe("high"));

    act(() => result.current.setLevel("xhigh"));

    expect(result.current.level).toBe("xhigh");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/agent/code/sessions/s1/thinking-level");
  });
});
