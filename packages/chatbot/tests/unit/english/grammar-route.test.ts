import { describe, it, expect, vi, beforeEach } from "vitest";

// The route's only dependency is the workflow module: mock it so the test
// asserts on the parsed request body without touching the inference kit.
const mockState = vi.hoisted(() => ({
  prompts: [] as unknown[],
}));

vi.mock("@/lib/features/english/workflows", () => ({
  correctGrammar: async (prompt: unknown) => {
    mockState.prompts.push(prompt);
    return {
      toTextStreamResponse: () =>
        new Response(String(prompt), {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
    };
  },
}));

import { POST } from "@/app/(chat)/api/english/grammar/route";

beforeEach(() => {
  mockState.prompts = [];
});

describe("POST /api/english/grammar", () => {
  // Contract pinned to the caller: `useObject` submits through
  // `experimental_useObject`, which posts `JSON.stringify(input)` — the raw
  // string, not `{ prompt }` (that envelope belongs to `useCompletion` and
  // the translate route). Destructuring `{ prompt }` here yields `undefined`
  // and blows up inside `pickDelimiter`, so this test guards the wire shape.
  it("reads the raw text body posted by the useObject hook", async () => {
    const input = "This are a grammatically incorrect sentence.";

    const response = await POST(
      new Request("http://test/api/english/grammar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    );

    expect(mockState.prompts).toEqual([input]);
    await expect(response.text()).resolves.toBe(input);
  });
});
