/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { usePromptRefiner } from "@/lib/features/meta-prompt/hooks/use-prompt-refiner";

/**
 * Prompt Refiner client state (ticket 08, replaces the `refine.spec` E2E).
 * The browser E2E routed `/api/refine-prompt` with page.route; here the same
 * contract is intercepted at fetch, and the server side is covered by
 * `tests/unit/meta-prompt/refine-prompt-route.test.ts` through the Gateway.
 */
describe("usePromptRefiner", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: "refined text" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function setup(initial: { input: string; status?: "ready" | "submitted" }) {
    const setInput = vi.fn();
    const hook = renderHook(
      (props: { input: string; status?: "ready" | "submitted" }) =>
        usePromptRefiner({
          input: props.input,
          setInput,
          messages: [],
          mode: "chat",
          status: props.status ?? "ready",
        }),
      { initialProps: initial },
    );
    return { ...hook, setInput };
  }

  it("posts the input to /api/refine-prompt and replaces it with the refined text", async () => {
    const { result, setInput } = setup({ input: "hello world" });

    act(() => result.current.refinePrompt());

    await waitFor(() => expect(setInput).toHaveBeenCalledWith("refined text"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/refine-prompt");
    const body = JSON.parse(String(init.body));
    expect(body.message.parts[0]).toEqual({ type: "text", text: "hello world" });
    expect(body.mode).toBe("chat");
    expect(result.current.hasPreviousMessage).toBe(true);
  });

  it("undo restores the original input and hides itself", async () => {
    const { result, setInput, rerender } = setup({ input: "hello world" });

    act(() => result.current.refinePrompt());
    await waitFor(() => expect(result.current.hasPreviousMessage).toBe(true));

    rerender({ input: "refined text" });
    act(() => result.current.undo());

    expect(setInput).toHaveBeenLastCalledWith("hello world");
    expect(result.current.hasPreviousMessage).toBe(false);
  });

  it("forgets the previous message once the conversation is submitted", async () => {
    const { result, rerender } = setup({ input: "hello world" });

    act(() => result.current.refinePrompt());
    await waitFor(() => expect(result.current.hasPreviousMessage).toBe(true));

    rerender({ input: "refined text", status: "submitted" });
    await waitFor(() => expect(result.current.hasPreviousMessage).toBe(false));
  });

  it("does nothing when the input is empty", () => {
    const { result } = setup({ input: "" });

    act(() => result.current.refinePrompt());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.hasPreviousMessage).toBe(false);
  });
});
