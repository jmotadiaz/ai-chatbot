import { describe, it, expect } from "vitest";
import { serializeMessages } from "@/lib/features/compaction/serialize";
import type { ChatbotMessage } from "@/lib/features/chat/types";

describe("serializeMessages", () => {
  it("serializes text messages with role prefixes", () => {
    const messages = [
      { id: "1", role: "user", parts: [{ type: "text", text: "Hello" }] },
      { id: "2", role: "assistant", parts: [{ type: "text", text: "Hi there" }] },
    ] as ChatbotMessage[];

    const result = serializeMessages(messages);
    expect(result).toContain("user: Hello");
    expect(result).toContain("assistant: Hi there");
  });

  it("includes reasoning parts with prefix", () => {
    const messages = [
      { id: "1", role: "assistant", parts: [
        { type: "reasoning", text: "Let me think" },
        { type: "text", text: "Final answer" },
      ]},
    ] as ChatbotMessage[];

    const result = serializeMessages(messages);
    expect(result).toContain("[Reasoning] Let me think");
    expect(result).toContain("Final answer");
  });

  it("includes file parts with file info", () => {
    const messages = [
      { id: "1", role: "user", parts: [
        { type: "file", url: "https://example.com/img.png", mediaType: "image/png", filename: "photo.png" },
      ]},
    ] as ChatbotMessage[];

    const result = serializeMessages(messages);
    expect(result).toContain("[File: photo.png (image/png)]");
  });

  it("truncates tool outputs to 2000 characters", () => {
    const longOutput = "A".repeat(3000);
    const part = {
      type: "tool-resolveLibraryId",
      toolCallId: "tc1",
      state: "output-available",
      input: { query: "test", libraryName: "test" },
      output: longOutput,
      title: "Test Tool",
    } as unknown as ChatbotMessage["parts"][number];
    const messages = [
      { id: "1", role: "assistant", parts: [part] },
    ] as unknown as ChatbotMessage[];

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThan(3000 + 100);
    expect(result).toContain("[Tool: resolveLibraryId]");
  });

  it("separates messages with double newlines", () => {
    const messages = [
      { id: "1", role: "user", parts: [{ type: "text", text: "First" }] },
      { id: "2", role: "assistant", parts: [{ type: "text", text: "Second" }] },
    ] as ChatbotMessage[];

    const result = serializeMessages(messages);
    expect(result).toContain("user: First\n\nassistant: Second");
  });
});
