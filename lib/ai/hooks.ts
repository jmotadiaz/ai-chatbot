import {
  experimental_useObject,
  Experimental_UseObjectHelpers,
  Experimental_UseObjectOptions,
  UseChatHelpers,
} from "@ai-sdk/react";
import { UIMessage } from "ai";
import { useCallback, useEffect, useState } from "react";

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

export type UseObjectParams<T> = Experimental_UseObjectOptions<T>;
export type UseObjectReturn<T> = Omit<
  Experimental_UseObjectHelpers<T, unknown>,
  "submit"
> & {
  input: string;
  handleInputChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  submit: () => void;
  handleSubmit: (e: React.FormEvent) => void;
};

export const useObject = <T>(args: UseObjectParams<T>): UseObjectReturn<T> => {
  const { submit: internalSubmit, ...objectResult } =
    experimental_useObject(args);
  const [input, setInput] = useState("");

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    []
  );

  const submit = useCallback(() => {
    internalSubmit(input);
  }, [input, internalSubmit]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      submit();
    },
    [submit]
  );

  return {
    ...objectResult,
    input,
    handleInputChange,
    handleSubmit,
    submit,
  };
};

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
        const audioBlob = await response.blob();
        const url = URL.createObjectURL(audioBlob);
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
