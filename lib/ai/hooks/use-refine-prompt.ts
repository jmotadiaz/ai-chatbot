import { UseChatHelpers } from "@ai-sdk/react";
import { UIMessage } from "ai";
import { useEffect, useState } from "react";
import { useGeneratedText } from "./use-generated-text";

export interface UseRefinePromptParams {
  input: string;
  setInput: (value: string) => void;
  messages?: UIMessage[];
  metaPrompt?: string | null;
  status?: UseChatHelpers["status"];
}

export interface RefinePromptReturn {
  isLoadingRefinedPrompt: boolean;
  refinePrompt: () => void;
  undo: () => void;
  hasPreviousMessage: boolean;
}

export const useRefinePrompt = ({
  input,
  setInput,
  messages,
  metaPrompt,
  status,
}: UseRefinePromptParams): RefinePromptReturn => {
  const [previousMessage, setPreviousMessage] = useState<string | null>(null);
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
        setPreviousMessage(input);
        setInput(generatedText);
      },
    });
  };

  const undo = () => {
    if (previousMessage) {
      setInput(previousMessage);
      setPreviousMessage(null);
    }
  };

  useEffect(() => {
    if (status === "submitted") {
      setPreviousMessage(null);
    }
  }, [status]);

  return {
    isLoadingRefinedPrompt: isLoading,
    refinePrompt,
    undo,
    hasPreviousMessage: !!previousMessage,
  };
};
