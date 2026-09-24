import { describe, expect, it, vi } from "vitest";
import type { SpeechModelV3 } from "@ai-sdk/provider";
import { createSpeechModelResolver } from "../../src/speech-model";
import type { SpeechClients } from "../../src/types";

const stubSpeechModel = (modelId: string): SpeechModelV3 =>
  ({ modelId, specificationVersion: "v3", provider: "stub" }) as unknown as SpeechModelV3;

function stubClients(): SpeechClients {
  return {
    openai: vi.fn((modelId: string) => stubSpeechModel(modelId)),
  };
}

describe("speechModel: id/role -> SpeechModelV3", () => {
  it("resolves a role to the same model as its underlying SPEECH_MODELS id", () => {
    const clients = stubClients();
    const speechModel = createSpeechModelResolver(clients);

    const byRole = speechModel("englishTts");
    const byId = speechModel("GPT-4o Mini TTS");

    expect(byRole).toBe(byId);
    expect(clients.openai).toHaveBeenCalledTimes(1);
    expect(clients.openai).toHaveBeenCalledWith("gpt-4o-mini-tts-2025-03-20");
  });

  it("memoizes: one client construction per id regardless of how it's addressed", () => {
    const clients = stubClients();
    const speechModel = createSpeechModelResolver(clients);

    speechModel("englishTts");
    speechModel("englishTts");
    speechModel("GPT-4o Mini TTS");

    expect(clients.openai).toHaveBeenCalledTimes(1);
  });

  it("throws for an id absent from SPEECH_MODELS", () => {
    const speechModel = createSpeechModelResolver(stubClients());
    expect(() => speechModel("not-a-real-speech-model" as any)).toThrow();
  });
});
