import { generateText, Output } from "ai";
import { z } from "zod";
import {
  MEMORY_DECOMPOSITION_SYSTEM_PROMPT,
  MEMORY_DECOMPOSITION_DESCRIPTION,
} from "./prompts";
import { languageModelConfigurations } from "@/lib/features/foundation-model/config";

const queryDecompositionSchema = z.object({
  queries: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe(MEMORY_DECOMPOSITION_DESCRIPTION),
});

/**
 * Decomposes a user message into 1-3 targeted search queries for memory retrieval.
 */
export async function decomposeForMemorySearch({
  message,
}: {
  message: string;
}): Promise<string[]> {
  if (!message.trim()) return [];

  try {
    const { output } = await generateText({
      ...languageModelConfigurations("GPT OSS Mini"),
      system: MEMORY_DECOMPOSITION_SYSTEM_PROMPT,
      prompt: `User Message: "${message}"`,
      output: Output.object({ schema: queryDecompositionSchema }),
    });

    return output.queries;
  } catch (error) {
    console.error("Failed to decompose message for memory search:", error);
    // Fallback to the original message if decomposition fails
    return [message];
  }
}
