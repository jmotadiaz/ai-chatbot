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
  const { generate, isLoading } = useGeneratedText({
    api: "/api/refine-prompt",
  });
  const isRefinePromptEnabled = !!input.length && !isLoading;

  const refinePrompt = () => {
    if (!isRefinePromptEnabled) return;
    generate({
      prompt: input,
      body: {
        messages: messages || null,
        metaPrompt: metaPrompt || null,
      },
      onFinish: (generatedText) => {
        setInput(generatedText);
      },
    });
  };

  return {
    isLoadingRefinedPrompt: isLoading,
    refinePrompt,
  };
};

export interface UseGenerateTextParams {
  api: string;
}

interface GenerateTextParams {
  prompt?: string;
  onFinish?: (generatedText: string) => void;
  body?: Record<string, unknown>;
}

export interface UseGenerateTextReturn {
  text: string;
  isLoading: boolean;
  generate: (params?: GenerateTextParams) => Promise<void>;
  input: string;
  handleInputChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
}

export const useGeneratedText = ({ api }: UseGenerateTextParams) => {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");

  const generate = useCallback(
    async ({ prompt, onFinish, body }: GenerateTextParams = {}) => {
      setIsLoading(true);
      setText("");

      await fetch(api, {
        method: "POST",
        body: JSON.stringify({
          prompt: prompt || input,
          ...body,
        }),
      }).then((response) => {
        response.json().then((json) => {
          setText(json.text);
          onFinish?.(json.text);
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
