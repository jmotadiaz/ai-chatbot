import { describe, it, expect } from "vitest";
import { estimateTokens, estimateContextTokens, extractTextContent } from "@/lib/features/compaction/token-estimation";
import type { ChatbotMessage } from "@/lib/features/chat/types";

const createMessage = (overrides: Partial<ChatbotMessage> = {}): ChatbotMessage => ({
  id: "msg-1",
  role: "user",
  parts: [],
  ...overrides,
});

describe("estimateTokens", () => {
  it("returns 0 for a message with no parts", () => {
    const msg = createMessage({ parts: [] });
    expect(estimateTokens(msg)).toBe(0);
  });

  it("estimates tokens from text parts using chars/4", () => {
    const msg = createMessage({
      parts: [{ type: "text", text: "Hello, world!" }] as ChatbotMessage["parts"],
    });
    expect(estimateTokens(msg)).toBe(4);
  });

  it("estimates tokens from multiple text parts", () => {
    const msg = createMessage({
      parts: [
        { type: "text", text: "Hello, world!" },
        { type: "text", text: "This is a test" },
      ] as ChatbotMessage["parts"],
    });
    expect(estimateTokens(msg)).toBe(7);
  });

  it("adds flat 4800 chars for file parts", () => {
    const msg = createMessage({
      parts: [
        { type: "text", text: "Hello" },
        { type: "file", url: "https://example.com/img.png", mediaType: "image/png", filename: "img.png" },
      ] as ChatbotMessage["parts"],
    });
    const tokens = estimateTokens(msg);
    expect(tokens).toBeGreaterThanOrEqual(1201);
  });

  it("handles reasoning parts", () => {
    const msg = createMessage({
      parts: [{ type: "reasoning", text: "I think therefore I am" }] as ChatbotMessage["parts"],
    });
    expect(estimateTokens(msg)).toBe(6);
  });

  it("handles source-url and source-document parts without counting them", () => {
    const msg = createMessage({
      parts: [
        { type: "text", text: "Hello" },
        { type: "source-url", sourceId: "s1", url: "https://example.com" },
        { type: "source-document", sourceId: "s2", mediaType: "text/plain", title: "doc" },
      ] as ChatbotMessage["parts"],
    });
    expect(estimateTokens(msg)).toBe(2);
  });
});

describe("estimateContextTokens", () => {
  it("sums tokens for all messages without provider usage", () => {
    const msgs = [
      createMessage({ id: "1", parts: [{ type: "text", text: "Hello" }] as ChatbotMessage["parts"] }),
      createMessage({ id: "2", parts: [{ type: "text", text: "World" }] as ChatbotMessage["parts"] }),
    ];
    expect(estimateContextTokens(msgs)).toBe(4);
  });

  it("uses provider usage minus last message when available", () => {
    const msgs = [
      createMessage({ id: "1", parts: [{ type: "text", text: "Hello" }] as ChatbotMessage["parts"] }),
      createMessage({ id: "2", parts: [{ type: "text", text: "World" }] as ChatbotMessage["parts"] }),
    ];
    const tokens = estimateContextTokens(msgs, { inputTokens: 100 });
    expect(tokens).toBe(98);
  });
});

describe("extractTextContent", () => {
  it("extracts text from text parts", () => {
    const msg = createMessage({
      parts: [{ type: "text", text: "Hello, world!" }] as ChatbotMessage["parts"],
    });
    expect(extractTextContent(msg)).toBe("Hello, world!");
  });

  it("extracts text from reasoning parts", () => {
    const msg = createMessage({
      parts: [
        { type: "reasoning", text: "thinking..." },
        { type: "text", text: "Answer" },
      ] as ChatbotMessage["parts"],
    });
    expect(extractTextContent(msg)).toBe("thinking...Answer");
  });

  it("returns empty string for file-only messages", () => {
    const msg = createMessage({
      parts: [{ type: "file", url: "https://example.com/img.png", mediaType: "image/png" }] as ChatbotMessage["parts"],
    });
    expect(extractTextContent(msg)).toBe("");
  });
});
