"use server";

import { experimental_generateSpeech as aiGenerateSpeech } from "ai";
import { openai } from "@ai-sdk/openai";

export async function generateSpeech(text: string) {
  const result = await aiGenerateSpeech({
    model: openai.speech("gpt-4o-mini-tts-2025-03-20"),
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
