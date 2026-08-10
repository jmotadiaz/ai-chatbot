/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ThinkingLevel } from "models";
import { setupMswServer } from "../../helpers/msw-server";
import { useCodingAgentSessionThinkingLevel } from "@/lib/features/code/hooks/use-coding-agent-session-thinking-level";

const thinkingLevelUrl = "*/api/agent/code/sessions/s1/thinking-level";
let requestCount = 0;
let requestedUrl: string | undefined;

const server = setupMswServer(
  http.get(thinkingLevelUrl, ({ request }) => {
    requestCount += 1;
    requestedUrl = request.url;
    return HttpResponse.json({
      thinking: { level: "high", levels: ["off", "high", "xhigh"] },
    });
  }),
);

describe("useCodingAgentSessionThinkingLevel", () => {
  beforeEach(() => {
    requestCount = 0;
    requestedUrl = undefined;
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
    expect(new URL(requestedUrl!).pathname).toBe(
      "/api/agent/code/sessions/s1/thinking-level",
    );
  });

  it("keeps the catalog default when the worker has no session yet", async () => {
    server.use(
      http.get(thinkingLevelUrl, () => {
        requestCount += 1;
        return HttpResponse.json({ thinking: null });
      }),
    );

    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({
        sessionId: "s1",
        modelId: "Deepseek v4 Pro",
        defaultLevel: "xhigh",
      }),
    );

    await waitFor(() => expect(requestCount).toBe(1));
    expect(result.current.level).toBe("xhigh");
  });

  it("resets to the new model's default when the picker changes, without refetching", async () => {
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
    expect(requestCount).toBe(1);
  });

  it("ignores the initial GET when the user already picked a level", async () => {
    let resolveGet!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      resolveGet = resolve;
    });
    server.use(
      http.get(thinkingLevelUrl, async () => {
        requestCount += 1;
        await responseGate;
        return HttpResponse.json({
          thinking: { level: "high", levels: ["off", "high", "xhigh"] },
        });
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
      resolveGet();
    });

    expect(result.current.level).toBe("low");
  });

  it("ignores the initial GET when the model changed while it was in flight", async () => {
    let resolveGet!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      resolveGet = resolve;
    });
    server.use(
      http.get(thinkingLevelUrl, async () => {
        requestCount += 1;
        await responseGate;
        return HttpResponse.json({
          thinking: { level: "xhigh", levels: ["off", "high", "xhigh"] },
        });
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
      resolveGet();
    });

    expect(result.current.level).toBe("high");
  });

  it("keeps the server-resolved level when the model resolves, without fetching", async () => {
    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({
        sessionId: "s1",
        modelId: "Deepseek v4 Pro",
        defaultLevel: "xhigh",
        initialThinking: { level: "low" },
      }),
    );

    // The catalog default must not overwrite an answer the server already had:
    // the first model resolution is exactly where that used to happen.
    expect(result.current.level).toBe("low");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.level).toBe("low");
    expect(requestCount).toBe(0);
  });

  it("keeps the catalog default when the server says the session never ran", async () => {
    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({
        sessionId: "s1",
        modelId: "Deepseek v4 Pro",
        defaultLevel: "xhigh",
        initialThinking: { level: null },
      }),
    );

    await waitFor(() => expect(result.current.level).toBe("xhigh"));
    // An answered "no level yet" is still an answer — nothing left to ask.
    expect(requestCount).toBe(0);
  });

  it("fetches when the server could not answer at all", async () => {
    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({
        sessionId: "s1",
        modelId: "Deepseek v4 Pro",
        defaultLevel: "xhigh",
        initialThinking: null,
      }),
    );

    await waitFor(() => expect(result.current.level).toBe("high"));
    expect(requestCount).toBe(1);
  });

  it("still resets to the new model's default after a seeded start", async () => {
    const { result, rerender } = renderHook(
      ({ modelId, defaultLevel }) =>
        useCodingAgentSessionThinkingLevel({
          sessionId: "s1",
          modelId,
          defaultLevel,
          initialThinking: { level: "low" },
        }),
      {
        initialProps: {
          modelId: "Deepseek v4 Pro",
          defaultLevel: "xhigh" as ThinkingLevel,
        },
      },
    );
    expect(result.current.level).toBe("low");

    rerender({ modelId: "Kimi K2.7 Code", defaultLevel: "high" as ThinkingLevel });

    // The seed is consumed once: a real model change still wins over it.
    expect(result.current.level).toBe("high");
    expect(requestCount).toBe(0);
  });

  it("does not fetch until the model is known", () => {
    const { result } = renderHook(() =>
      useCodingAgentSessionThinkingLevel({
        sessionId: "s1",
        modelId: null,
        defaultLevel: "xhigh",
      }),
    );
    expect(requestCount).toBe(0);
    expect(result.current.level).toBeNull();
  });

  it("sets the level locally, with no request (it travels with the prompt)", async () => {
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
    expect(requestCount).toBe(1);
    expect(new URL(requestedUrl!).pathname).toBe(
      "/api/agent/code/sessions/s1/thinking-level",
    );
  });
});
