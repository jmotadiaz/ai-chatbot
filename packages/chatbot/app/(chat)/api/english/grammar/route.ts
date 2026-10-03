import { correctGrammar } from "@/lib/features/english/workflows";

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

export async function POST(req: Request) {
  // `useObject` submits through `experimental_useObject`, whose request body
  // is `JSON.stringify(input)` — the raw string, not `{ prompt }`. The
  // translate route reads `{ prompt }` because `useCompletion` builds that
  // envelope for it; matching the grammar hook's shape here is what keeps the
  // text from arriving as `undefined`.
  const prompt: string = await req.json();

  const result = await correctGrammar(prompt);

  return result.toTextStreamResponse();
}
