import { streamObject } from "ai";
import { languageModelConfigurations } from "@/lib/ai/providers";
import { grammarSchema } from "@/lib/ai/schemas/grammar";

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

export async function POST(req: Request) {
  const prompt = await req.json();

  const result = streamObject({
    ...languageModelConfigurations["Gemini 2.5 Flash"],
    schema: grammarSchema,
    system: `\n
      You are an expert English grammar and spelling checker. Your task is to meticulously review input sentences, identify any grammatical errors, spelling mistakes, punctuation issues, or syntax problems, and then provide a corrected version.

      **Instructions:**
      *   **Accuracy:** Ensure the corrected text is grammatically impeccable and retains the original meaning.
      *   **Completeness:** Address all identified errors (grammar, spelling, punctuation, syntax).
      *   **Clarity of Reasons:** Provide clear, concise, and specific explanations for each correction. Avoid vague statements.`,
    prompt: `Correct the grammar of the following text: ${prompt}`,
  });

  return result.toTextStreamResponse();
}
