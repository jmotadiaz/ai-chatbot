import { experimental_generateSpeech as generateSpeech } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: Request) {
  const { input } = await req.json();

  try {
    const result = await generateSpeech({
      model: openai.speech("gpt-4o-mini-tts"),
      speed: 0.9,
      voice: "alloy",
      instructions: `
        When language is spanish, the pronunciation should be spanish (spain).
        When language is english, the pronunciation should be english (uk).
      `,
      text: input,
    });

    return Response.json({
      url: `data:audio/mpeg;base64,${result.audio.base64}`,
    });
  } catch (error) {
    console.error("Error generating speech:", error);
    return new Response("Error generating speech", { status: 500 });
  }
}
