"use client";

import { useCallback, useState } from "react";

export interface UseSpeechParams {
  input: string;
  api?: string;
}
export interface UseSpeechReturn {
  audioUrl: string | null;
  isGenerating: boolean;
  generateSpeech: () => Promise<void>;
  clearAudio: () => void;
}

export const useSpeech = ({ input, api = "/api/speech" }: UseSpeechParams) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const clearAudio = useCallback(() => {
    setAudioUrl(null);
  }, []);

  const generateSpeech = async () => {
    if (!input.trim()) return;

    setIsGenerating(true);
    try {
      const response = await fetch(api, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input }),
      });

      if (response.ok) {
        const { url } = (await response.json()) as {
          url: string;
        };
        setAudioUrl(url);
      } else {
        console.error("Error generating speech");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    audioUrl,
    isGenerating,
    generateSpeech,
    clearAudio,
  };
};
