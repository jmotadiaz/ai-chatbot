import "server-only";

import { generateText, Output, embedMany } from "ai";
import { z } from "zod";
import { MEMORY_EXTRACTION_SYSTEM_PROMPT } from "./prompts";
import { upsertMemoryFact } from "./dedup";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { messagePartsToText } from "@/lib/features/chat/utils";
import { languageModelConfigurations } from "@/lib/features/foundation-model/config";
import { providers } from "@/lib/infrastructure/ai/providers";

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
    ...languageModelConfigurations("Gemini 3.1 Flash Lite"),
    system: MEMORY_EXTRACTION_SYSTEM_PROMPT,
    prompt: conversation,
    output: Output.object({ schema: factSchema }),
  });

  const { facts } = output;
  if (facts.length === 0) return;

  const contents = facts.map((f) => f.content);
  const { embeddings } = await embedMany({
    model: providers.embedding(),
    providerOptions: {
      google: {
        outputDimensionality: 768,
        taskType: "SEMANTIC_SIMILARITY",
      },
    },
    values: contents,
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
