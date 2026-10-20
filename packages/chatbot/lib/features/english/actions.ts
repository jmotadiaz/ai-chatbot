"use server";

import { experimental_generateSpeech as aiGenerateSpeech } from "ai";
import { warmModelCatalog } from "@/lib/infrastructure/ai/catalog";
import { speechModel } from "@/lib/infrastructure/ai/inference-kit";

export async function generateSpeech(text: string) {
  await warmModelCatalog();
  const result = await aiGenerateSpeech({
    // Contrato único del Gateway: `tts-default` (`POST /v1/audio/speech`).
    model: speechModel(),
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
