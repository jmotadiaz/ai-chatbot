import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { ArrowUp, Pencil, Settings } from "lucide-react";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { InputNumber } from "@/components/ui/input-number";
import { cn } from "../lib/utils";
import { UIMessage } from "ai";

interface TextareaProps {
  messages: UIMessage[];
  input: string;
  setInput: (value: string) => void;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading: boolean;
  status: string;
  stop: () => void;
  temperature: number;
  topP: number;
  topK: number;
  setTemperature: (value: number) => void;
  setTopP: (value: number) => void;
  setTopK: (value: number) => void;
}

export const Textarea = ({
  messages,
  input,
  setInput,
  handleInputChange,
  isLoading,
  status,
  stop,
  temperature,
  topP,
  topK,
  setTemperature,
  setTopP,
  setTopK,
}: TextareaProps) => {
  const [showSettings, setShowSettings] = useState(false);
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
    <div className="relative bg-secondary w-full rounded-2xl">
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

      {/* Settings icon and dropdown */}
      <button
        type="button"
        onClick={() => setShowSettings(!showSettings)}
        className="absolute z-3 left-1 bottom-1 p-3 cursor-pointer"
      >
        <Settings className="h-5 w-5 text-gray-800 dark:text-white" />
      </button>
      {showSettings && (
        <>
          {/* Overlay to close settings on outside click */}
          <div
            className="fixed inset-0 z-10 bg-transparent"
            onClick={() => setShowSettings(false)}
          />
          {/* Settings dropdown panel */}
          <div className="absolute left-2 bottom-32 w-72 bg-white dark:bg-zinc-800 p-4 rounded-lg shadow-lg z-20">
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="temperature">Temperature</Label>
              <InputNumber
                id="temperature"
                value={temperature}
                min={0}
                max={1}
                step={0.1}
                onChange={setTemperature}
              />
            </div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="topP">Top P</Label>
              <InputNumber
                id="topP"
                value={topP}
                min={0}
                max={1}
                step={0.01}
                onChange={setTopP}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="topK">Top K</Label>
              <InputNumber
                id="topK"
                value={topK}
                min={0}
                max={100}
                step={10}
                onChange={setTopK}
              />
            </div>
          </div>
        </>
      )}
      {status === "streaming" || status === "submitted" ? (
        <button
          type="button"
          onClick={stop}
          className="cursor-pointer z-3 absolute right-2 bottom-2 rounded-full p-2 bg-black hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed transition-colors"
        >
          <div className="animate-spin h-4 w-4">
            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        </button>
      ) : (
        <>
          <span
            onClick={handleRefinePrompt}
            className={cn(
              "absolute z-3 right-12 bottom-2 rounded-full p-2  transition-colors",
              isRefinePromptEnabled
                ? "bg-black hover:bg-zinc-800"
                : "bg-zinc-300 dark:bg-zinc-700 dark:opacity-80 cursor-not-allowed"
            )}
          >
            <Pencil className="h-4 w-4 text-white" />
          </span>

          <button
            type="submit"
            disabled={isLoading || isLoadingRefinedPrompt || !input.trim()}
            className="absolute z-3 right-2 bottom-2 rounded-full p-2 bg-black hover:bg-zinc-800 disabled:bg-zinc-300 disabled:dark:bg-zinc-700 dark:disabled:opacity-80 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowUp className="h-4 w-4 text-white" />
          </button>
        </>
      )}
    </div>
  );
};
