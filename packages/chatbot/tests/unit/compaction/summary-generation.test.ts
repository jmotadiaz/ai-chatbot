import { describe, it, expect, vi } from "vitest";
import {
  generateSummary,
  generateTurnPrefixSummary,
} from "@/lib/features/compaction/summary-generation";
import type { CompactionAiPort } from "@/lib/features/compaction/ports";
import type { ChatbotMessage } from "@/lib/features/chat/types";

const textMessages = [
  { id: "1", role: "user", parts: [{ type: "text", text: "Hello" }] },
  { id: "2", role: "assistant", parts: [{ type: "text", text: "Hi there" }] },
] as ChatbotMessage[];

const multimediaMessages = [
  {
    id: "1",
    role: "user",
    parts: [
      { type: "file", url: "https://example.com/img.png", mediaType: "image/png" },
    ],
  },
] as ChatbotMessage[];

function buildAiPort(): CompactionAiPort {
  return { generateText: vi.fn().mockResolvedValue("fake summary") };
}

/**
 * `modelUsed` is persisted verbatim into `ChatSummary.modelUsed`
 * (`lib/infrastructure/db/schema.ts`) as provenance, so it must stay the
 * resolved catalog id the role currently points at — not the role name
 * passed to the port (which is what the AI port still resolves by).
 */
describe("generateSummary / generateTurnPrefixSummary: modelUsed provenance", () => {
  it("generateSummary passes the compactionText role to the port and returns its catalog id", async () => {
    const ai = buildAiPort();

    const { modelUsed } = await generateSummary(ai, textMessages);

    expect(ai.generateText).toHaveBeenCalledWith(
      "compactionText",
      expect.any(String),
      expect.any(String),
    );
    expect(modelUsed).toBe("Deepseek v4.1 Flash");
  });

  it("generateSummary passes the compactionMultimedia role to the port and returns its catalog id", async () => {
    const ai = buildAiPort();

    const { modelUsed } = await generateSummary(ai, multimediaMessages);

    expect(ai.generateText).toHaveBeenCalledWith(
      "compactionMultimedia",
      expect.any(String),
      expect.any(String),
    );
    expect(modelUsed).toBe("Qwen 3.8 Flash");
  });

  it("generateTurnPrefixSummary returns the same catalog ids for the same two roles", async () => {
    const textAi = buildAiPort();
    const multimediaAi = buildAiPort();

    const textResult = await generateTurnPrefixSummary(textAi, textMessages);
    const multimediaResult = await generateTurnPrefixSummary(
      multimediaAi,
      multimediaMessages,
    );

    expect(textAi.generateText).toHaveBeenCalledWith(
      "compactionText",
      expect.any(String),
      expect.any(String),
    );
    expect(textResult.modelUsed).toBe("Deepseek v4.1 Flash");

    expect(multimediaAi.generateText).toHaveBeenCalledWith(
      "compactionMultimedia",
      expect.any(String),
      expect.any(String),
    );
    expect(multimediaResult.modelUsed).toBe("Qwen 3.8 Flash");
  });
});
