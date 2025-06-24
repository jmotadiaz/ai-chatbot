import { experimental_generateSpeech as generateSpeech } from "ai";
import { openai } from "@/lib/ai/providers";

export async function POST(req: Request) {
  const { input } = await req.json();

  try {
    const result = await generateSpeech({
      model: openai.speech("tts-1"),
      speed: 0.9,
      voice: "alloy",
      text: input,
    });

    return new Response(result.audio.uint8Array, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="speech.mp3"',
      },
    });
  } catch (error) {
    console.error("Error generating speech:", error);
    return new Response("Error generating speech", { status: 500 });
  }
}
