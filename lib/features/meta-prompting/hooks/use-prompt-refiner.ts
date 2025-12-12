import type { UseChatHelpers } from "@ai-sdk/react";
import { useEffect, useState } from "react";
import { useGeneratedText } from "@/lib/ai/hooks/use-generated-text";
import type { ChatbotMessage } from "@/lib/features/chat/types";

export interface UsePromptRefinerParams {
  input: string;
  setInput: (value: string) => void;
  messages?: ChatbotMessage[];
  metaPrompt?: string | null;
  status?: UseChatHelpers<never>["status"];
}

export interface UsePromptRefinerReturn {
  isLoadingRefinedPrompt: boolean;
  refinePrompt: () => void;
  undo: () => void;
  hasPreviousMessage: boolean;
}

export const usePromptRefiner = ({
  input,
  setInput,
  messages,
  metaPrompt,
  status,
}: UsePromptRefinerParams): UsePromptRefinerReturn => {
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
