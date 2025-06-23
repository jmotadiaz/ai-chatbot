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
      You are an expert in English grammar correction.
      Correct the grammar of the provided text while preserving its original meaning and tone.
      Provide reasons for each correction made.\n
    `,
    prompt: `Correct the grammar of the following text: ${prompt}`,
  });

  return result.toTextStreamResponse();
}
