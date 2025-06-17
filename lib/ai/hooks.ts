import { UIMessage } from "ai";
import { useCallback, useState } from "react";

export interface UseRefinePromptParams {
  input: string;
  setInput: (value: string) => void;
  messages?: UIMessage[];
  metaPrompt?: string | null;
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

export interface UseGenerateTextParams {
  api: string;
}

export const useGeneratedText = ({ api }: UseGenerateTextParams) => {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");

  const generate = useCallback(
    async ({ prompt }: { prompt?: string } = {}) => {
      setIsLoading(true);
      setText("");

      await fetch(api, {
        method: "POST",
        body: JSON.stringify({
          prompt: prompt || input,
        }),
      }).then((response) => {
        response.json().then((json) => {
          setText(json.text);
          setIsLoading(false);
        });
      });
    },
    [api, input]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(event.target.value);
    },
    []
  );

  return {
    text,
    isLoading,
    generate,
    input,
    handleInputChange,
  };
};
