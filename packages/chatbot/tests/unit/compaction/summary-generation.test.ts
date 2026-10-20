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
 * (`lib/infrastructure/db/schema.ts`) as provenance: with the Model Gateway
 * (ADR 0010) the Default Model Contract IS the stable identifier, so the
 * same contract the port resolves by is what gets persisted.
 */
describe("generateSummary / generateTurnPrefixSummary: modelUsed provenance", () => {
  it("generateSummary passes the text contract to the port and returns it as provenance", async () => {
    const ai = buildAiPort();

    const { modelUsed } = await generateSummary(ai, textMessages);

    expect(ai.generateText).toHaveBeenCalledWith(
      "reasoning-default",
      expect.any(String),
      expect.any(String),
    );
    expect(modelUsed).toBe("reasoning-default");
  });

  it("generateSummary passes the multimedia contract to the port and returns it as provenance", async () => {
    const ai = buildAiPort();

    const { modelUsed } = await generateSummary(ai, multimediaMessages);

    expect(ai.generateText).toHaveBeenCalledWith(
      "vision-default",
      expect.any(String),
      expect.any(String),
    );
    expect(modelUsed).toBe("vision-default");
  });

  it("generateTurnPrefixSummary returns the same contracts for the same two branches", async () => {
    const textAi = buildAiPort();
    const multimediaAi = buildAiPort();

    const textResult = await generateTurnPrefixSummary(textAi, textMessages);
    const multimediaResult = await generateTurnPrefixSummary(
      multimediaAi,
      multimediaMessages,
    );

    expect(textAi.generateText).toHaveBeenCalledWith(
      "reasoning-default",
      expect.any(String),
      expect.any(String),
    );
    expect(textResult.modelUsed).toBe("reasoning-default");

    expect(multimediaAi.generateText).toHaveBeenCalledWith(
      "vision-default",
      expect.any(String),
      expect.any(String),
    );
    expect(multimediaResult.modelUsed).toBe("vision-default");
  });
});
