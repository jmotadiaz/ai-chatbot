"use server";

import { experimental_transcribe as aiTranscribe } from "ai";
import { groq } from "@ai-sdk/groq";

export interface TranscribeResult {
  text: string;
}

/**
 * Transcribes a single audio segment to text using Whisper on Groq. This lives
 * in the BFF (never in the coding-agent worker): the worker only ever receives
 * the final text, exactly like a typed prompt.
 */
export async function transcribeAudio(
  audio: Uint8Array,
): Promise<TranscribeResult> {
  const result = await aiTranscribe({
    model: groq.transcription("whisper-large-v3"),
    audio,
  });

  return { text: result.text };
}
