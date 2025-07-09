import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface TextareaProps {
  input: string;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading: boolean;
  isLoadingRefinedPrompt?: boolean;
}

export const Textarea = ({
  input,
  handleInputChange,
  isLoadingRefinedPrompt,
  isLoading,
}: TextareaProps) => {
  const [isBigSize, setIsBigSize] = useState(false);
  return (
    <div className="bg-secondary dark:bg-zinc-700 w-full rounded-2xl border-2 border-transparent has-[:focus]:border-ring shadow-xs overflow-hidden transition-all duration-200">
      <div
        className={cn(
          "absolute z-3 top-0 bottom-16 pt-4 px-4 left-0 w-full",
          isLoadingRefinedPrompt ? "block" : "hidden"
        )}
      >
        <div className="flex flex-col justify-around h-full w-full">
          <div className="w-full bg-gray-200 dark:bg-zinc-800 rounded-2xl py-2 animate-pulse" />
          <div className="w-2/5 bg-gray-200 dark:bg-zinc-800 rounded-2xl mt-2 py-2 animate-pulse" />
        </div>
      </div>
      <div
        className="absolute z-2 top-3 right-3 cursor-pointer"
        onClick={() => setIsBigSize((previous) => !previous)}
      >
        {isBigSize ? (
          <Minimize2 className="h-4 w-4" />
        ) : (
          <Maximize2 className="h-4 w-4" />
        )}
      </div>
      <ShadcnTextarea
        className={cn(
          "resize-none relative bg-transparent w-full max-h-80 overflow-auto rounded-2xl z-1 pr-12 pt-4 mb-16 mt-2",
          { "h-80": isBigSize },
          isLoadingRefinedPrompt ? "opacity-0 max-h-18" : "opacity-100"
        )}
        theme="outline"
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
    </div>
  );
};
