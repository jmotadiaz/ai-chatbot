import { useCallback, useState } from "react";
import { toast } from "sonner";

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
      })
        .then((response) => {
          if (!response.ok) {
            return Promise.reject("Network response was not ok");
          }
          response.json().then((json) => {
            setText(json.text);
            onFinish?.(json.text);
          });
        })
        .catch((error) => {
          toast.error("Error generating text");
          console.error("Error generating text:", error);
        })
        .finally(() => {
          setIsLoading(false);
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
