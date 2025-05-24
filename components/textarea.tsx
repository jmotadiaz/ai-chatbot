import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";
import { UIMessage } from "ai";
import { ChatControl } from "./chat-control";

interface TextareaProps {
  messages: UIMessage[];
  input: string;
  setInput: (value: string) => void;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading: boolean;
  status: string;
  stop: () => void;
}

export const Textarea = ({
  messages,
  input,
  setInput,
  handleInputChange,
  isLoading,
}: TextareaProps) => {
  const [isLoadingRefinedPrompt, setIsLoadingRefinedPrompt] = useState(false);
  const isRefinePromptEnabled = !!input.length && !isLoadingRefinedPrompt;

  const handleRefinePrompt = () => {
    if (!isRefinePromptEnabled) return;
    setIsLoadingRefinedPrompt(true);
    fetch("/api/refine-prompt", {
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

  return (
    <div className="bg-secondary w-full rounded-2xl">
      <div
        className={cn(
          "absolute z-2 top-0 bottom-16 pt-4 px-4 left-0 w-full",
          isLoadingRefinedPrompt ? "block" : "hidden"
        )}
      >
        <div className="flex flex-col justify-around h-full w-full">
          <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-2xl py-2 animate-pulse" />
          <div className="w-2/5 bg-gray-200 dark:bg-zinc-700 rounded-2xl mt-2 py-2 animate-pulse" />
        </div>
      </div>
      <ShadcnTextarea
        className={cn(
          "resize-none relative bg-secondary w-full rounded-2xl z-1 pr-12 pt-4 pb-16",
          isLoadingRefinedPrompt ? "opacity-0 max-h-32" : "opacity-100"
        )}
        value={input}
        placeholder={"Say something..."}
        // @ts-expect-error err
        onChange={handleInputChange}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (input.trim() && !isLoading) {
              // @ts-expect-error err
              const form = e.target.closest("form");
              if (form) form.requestSubmit();
            }
          }
        }}
      />
      <ChatControl
        className="absolute z-1 right-13 bottom-2"
        onClick={handleRefinePrompt}
        disabled={!input.length || isRefinePromptEnabled}
        isLoading={isLoadingRefinedPrompt}
      >
        <Pencil className="h-4 w-4 text-white" />
      </ChatControl>
    </div>
  );
};
