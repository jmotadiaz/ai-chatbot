import { UIMessage } from "ai";
import { useState } from "react";

export interface UseRefinePromptParams {
  input: string;
  setInput: (value: string) => void;
  messages?: UIMessage[];
  api?: string;
}

export interface RefinePromptReturn {
  isLoadingRefinedPrompt: boolean;
  refinePrompt: () => void;
}

export const useRefinePrompt = ({
  input,
  setInput,
  messages,
  api = "refine-prompt",
}: UseRefinePromptParams): RefinePromptReturn => {
  const [isLoadingRefinedPrompt, setIsLoadingRefinedPrompt] = useState(false);
  const isRefinePromptEnabled = !!input.length && !isLoadingRefinedPrompt;

  const refinePrompt = () => {
    if (!isRefinePromptEnabled) return;
    setIsLoadingRefinedPrompt(true);
    fetch(`/api/${api}`, {
      method: "POST",
      body: JSON.stringify({
        prompt: input,
        messages,
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
