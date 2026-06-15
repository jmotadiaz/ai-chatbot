import { describe, it, expect } from "vitest";
import { findCutPoint } from "@/lib/features/compaction/cut-point";
import type { ChatbotMessage } from "@/lib/features/chat/types";

const createMessage = (id: string, text: string, role: "user" | "assistant" = "user"): ChatbotMessage => ({
  id,
  role,
  parts: [{ type: "text", text }] as ChatbotMessage["parts"],
});

describe("findCutPoint", () => {
  it("returns all messages to keep when total tokens are under threshold", () => {
    const messages = [
      createMessage("1", "Hi"),
      createMessage("2", "Hello"),
    ];
    const result = findCutPoint(messages, 20000);
    expect(result.cutIndex).toBe(-1);
    expect(result.messagesToKeep).toHaveLength(2);
    expect(result.messagesToSummarize).toHaveLength(0);
  });

  it("cuts oldest messages when threshold is exceeded", () => {
    const messages = [
      createMessage("1", "A".repeat(400)),     // ~100 tokens
      createMessage("2", "B".repeat(400)),     // ~100 tokens
      createMessage("3", "C".repeat(40)),      // ~10 tokens
    ];
    const result = findCutPoint(messages, 50);
    expect(result.cutIndex).toBeGreaterThanOrEqual(0);
    expect(result.messagesToKeep.length).toBeGreaterThan(0);
    expect(result.messagesToSummarize.length).toBeGreaterThan(0);
    expect(result.messagesToSummarize.concat(result.messagesToKeep)).toEqual(messages);
  });

  it("keeps all messages if single message exceeds threshold", () => {
    const messages = [
      createMessage("1", "A".repeat(4000)),    // ~1000 tokens
    ];
    const result = findCutPoint(messages, 100);
    expect(result.cutIndex).toBe(0);
    expect(result.messagesToSummarize).toHaveLength(1);
    expect(result.messagesToKeep).toHaveLength(0);
  });

  it("cut always falls between complete messages", () => {
    const messages = [
      createMessage("1", "A".repeat(200)),
      createMessage("2", "B".repeat(200)),
      createMessage("3", "C".repeat(200)),
    ];
    const result = findCutPoint(messages, 150);
    expect(result.messagesToKeep.every((m) => messages.includes(m))).toBe(true);
    expect(result.messagesToSummarize.every((m) => messages.includes(m))).toBe(true);
    const allIds = [...result.messagesToSummarize, ...result.messagesToKeep].map((m) => m.id);
    expect(allIds).toEqual(["1", "2", "3"]);
  });

  it("preserves message order in result", () => {
    const messages = [
      createMessage("1", "A".repeat(400)),
      createMessage("2", "B".repeat(400)),
      createMessage("3", "C".repeat(4)),
    ];
    const result = findCutPoint(messages, 30);
    expect(result.messagesToSummarize.map((m) => m.id)).toEqual(["1", "2"]);
    expect(result.messagesToKeep.map((m) => m.id)).toEqual(["3"]);
  });

  it("handles empty message list", () => {
    const result = findCutPoint([], 20000);
    expect(result.cutIndex).toBe(-1);
    expect(result.messagesToKeep).toHaveLength(0);
    expect(result.messagesToSummarize).toHaveLength(0);
  });
});
