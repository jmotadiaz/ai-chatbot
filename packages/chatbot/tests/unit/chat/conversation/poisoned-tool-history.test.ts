import { describe, expect, it } from "vitest";
import { dedupeToolParts } from "@/lib/features/chat/conversation/factory";
import type { ChatbotMessage } from "@/lib/features/chat/types";

// Mirrors the poisoned history found in prod (chat eaa13e55…): an assistant
// turn whose model hallucinated a tool call in the tool-less neutral branch
// persisted TWO error parts for the same toolCallId — the typed
// `tool-resolveLibraryId` part and the `dynamic-tool` fallback written by the
// stream onError handler. Every provider rejects that history with a 400
// ("Duplicate function_call_output" on /responses, "Bad Request" on
// /chat/completions) no matter which model the user picks.
const poisonedParts = [
  { type: "step-start" },
  { type: "text", text: "Let me look that up." },
  {
    type: "tool-resolveLibraryId",
    toolCallId: "call_01a0c806d6a873b48698e5dea1197f52",
    state: "output-error",
    input: { libraryName: "resumable-stream", query: "redis" },
    errorText:
      "Runtime error: Model tried to call unavailable tool 'resolveLibraryId'. No tools are available.",
  },
  {
    type: "dynamic-tool",
    toolName: "resolveLibraryId",
    toolCallId: "call_01a0c806d6a873b48698e5dea1197f52",
    state: "output-error",
    input: { libraryName: "resumable-stream", query: "redis" },
    errorText: "Tool non available: resolveLibraryId",
  },
  { type: "text", text: "Done." },
] as unknown as ChatbotMessage["parts"];

describe("dedupeToolParts", () => {
  it("keeps the first part per toolCallId and drops the duplicate", () => {
    const result = dedupeToolParts(poisonedParts);
    const toolCallIds = result
      .filter((p) => p.type === "dynamic-tool" || p.type.startsWith("tool-"))
      .map((p) => (p as { toolCallId: string }).toolCallId);

    expect(toolCallIds).toHaveLength(1);
    expect(toolCallIds[0]).toBe("call_01a0c806d6a873b48698e5dea1197f52");
    // Non-tool parts survive untouched.
    expect(result.filter((p) => p.type === "text")).toHaveLength(2);
    expect(result.some((p) => p.type === "step-start")).toBe(true);
  });

  it("keeps distinct tool calls untouched", () => {
    const parts = [
      { type: "tool-queryDocs", toolCallId: "call_a" },
      { type: "dynamic-tool", toolName: "queryDocs", toolCallId: "call_b" },
      { type: "text", text: "hi" },
    ] as unknown as ChatbotMessage["parts"];

    expect(dedupeToolParts(parts)).toHaveLength(3);
  });

  it("keeps tool parts without a toolCallId (defensive)", () => {
    const parts = [{ type: "tool-x" }] as unknown as ChatbotMessage["parts"];
    expect(dedupeToolParts(parts)).toHaveLength(1);
  });
});
