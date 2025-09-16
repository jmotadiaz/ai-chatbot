import { useCallback, useState } from "react";
import { toast } from "sonner";
import { FilePart } from "@/lib/ai/utils";

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

export interface ImageResponse {
  base64Data: string;
  mediaType: string;
}

export interface ImageFile {
  url: string;
  mediaType: string;
}

export const useGeneratedText = ({ api }: UseGenerateTextParams) => {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<ImageFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");
  const [filesInput, setFilesInput] = useState<FilePart[]>([]);

  const generate = useCallback(
    async ({ prompt, onFinish, body }: GenerateTextParams = {}) => {
      setIsLoading(true);
      setText("");

      await fetch(api, {
        method: "POST",
        body: JSON.stringify({
          message: {
            role: "user",
            parts: [{ type: "text", text: prompt || input }, ...filesInput],
          },
          ...body,
        }),
      })
        .then((response) => {
          if (!response.ok) {
            return Promise.reject(response.statusText || response.status);
          }
          response.json().then((json) => {
            if (json.files) {
              setFiles(
                json.files.map((file: ImageResponse) => ({
                  url: `data:image/png;base64,${file.base64Data}`,
                  mediaType: file.mediaType,
                }))
              );
            }
            if (json.text) {
              setText(json.text);
            }
            onFinish?.(json.text);
            setIsLoading(false);
          });
        })
        .catch((error) => {
          toast.error(`Error generating text: ${error}`);
          console.error("Error generating text:", error);
          setIsLoading(false);
        });
    },
    [api, filesInput, input]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(event.target.value);
    },
    []
  );

  const clear = useCallback(() => {
    setText("");
    setFiles([]);
  }, []);

  return {
    text,
    files,
    isLoading,
    generate,
    input,
    setInput,
    filesInput,
    setFilesInput,
    handleInputChange,
    clear,
  };
};
