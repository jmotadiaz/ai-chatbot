import { generateSpeech } from "@/lib/features/english/actions";

export async function POST(req: Request) {
  const { input } = await req.json();

  try {
    const result = await generateSpeech(input);
    return Response.json(result);
  } catch (error) {
    console.error("Error generating speech:", error);
    return new Response("Error generating speech", { status: 500 });
  }
}
