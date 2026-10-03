"use server";

import { experimental_generateSpeech as aiGenerateSpeech } from "ai";
import { speechModel } from "@/lib/infrastructure/ai/inference-kit";

export async function generateSpeech(text: string) {
  const result = await aiGenerateSpeech({
    model: speechModel("englishTts"),
    speed: 0.9,
    voice: "alloy",
    instructions: `
      When language is spanish, the pronunciation should be spanish (spain).
      When language is english, the pronunciation should be english (uk).
    `,
    text,
  });

  return {
    url: `data:audio/mpeg;base64,${result.audio.base64}`,
  };
}
