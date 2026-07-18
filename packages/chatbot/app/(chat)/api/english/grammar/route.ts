import { correctGrammar } from "@/lib/features/english/workflows";

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

export async function POST(req: Request) {
  const prompt = await req.json();

  const result = await correctGrammar(prompt);

  return result.toTextStreamResponse();
}
