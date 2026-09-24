import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";
import { MEMORY_EXTRACTION_SYSTEM_PROMPT } from "./prompts";
import { upsertMemoryFact } from "./dedup";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { messagePartsToText } from "@/lib/features/chat/utils";
import { languageModelConfigurations } from "@/lib/features/foundation-model/server";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

const factSchema = z.object({
  facts: z.array(
    z.object({
      category: z.enum(["personal", "professional", "preferences"]),
      content: z.string(),
    }),
  ),
});

export async function extractMemoryFacts({
  messages,
  userId,
}: {
  messages: ChatbotMessage[];
  userId: string;
}): Promise<void> {
  const conversation = messages
    .map((m) => `${m.role}: ${messagePartsToText(m)}`)
    .join("\n");

  if (!conversation.trim()) return;

  const { output } = await generateText({
    ...languageModelConfigurations("GPT OSS Mini"),
    system: MEMORY_EXTRACTION_SYSTEM_PROMPT,
    prompt: conversation,
    output: Output.object({ schema: factSchema }),
  });

  const { facts } = output;
  if (facts.length === 0) return;

  const contents = facts.map((f) => f.content);
  const embeddings = await inferenceKit.embed("embedding", contents, {
    taskType: "SEMANTIC_SIMILARITY",
  });

  console.dir(facts, { depth: null });

  await Promise.all(
    facts.map((fact, i) =>
      upsertMemoryFact({
        userId,
        fact: { ...fact, embedding: embeddings[i] },
      }),
    ),
  );
}
