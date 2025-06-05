import { UIMessage } from "ai";
import { useState } from "react";

export interface UseRefinePromptParams {
  input: string;
  setInput: (value: string) => void;
  messages?: UIMessage[];
  metaPrompt?: string;
}

export interface RefinePromptReturn {
  isLoadingRefinedPrompt: boolean;
  refinePrompt: () => void;
}

export const useRefinePrompt = ({
  input,
  setInput,
  messages,
  metaPrompt,
}: UseRefinePromptParams): RefinePromptReturn => {
  const [isLoadingRefinedPrompt, setIsLoadingRefinedPrompt] = useState(false);
  const isRefinePromptEnabled = !!input.length && !isLoadingRefinedPrompt;

  const refinePrompt = () => {
    if (!isRefinePromptEnabled) return;
    setIsLoadingRefinedPrompt(true);
    fetch("/api/refine-prompt", {
      method: "POST",
      body: JSON.stringify({
        prompt: input,
        messages,
        metaPrompt,
      }),
    })
      .then((response) => {
        response.json().then(({ text }) => {
          if (text) {
            setInput(text.trim());
          }
        });
      })
      .finally(() => {
        setIsLoadingRefinedPrompt(false);
      });
  };

  return {
    isLoadingRefinedPrompt,
    refinePrompt,
  };
};
