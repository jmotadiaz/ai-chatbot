import { useLayoutEffect, useRef } from "react";
import { ClassValue } from "clsx";
import { Textarea as TextareaUI } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PreviewFiles } from "@/components/attachments-preview";

interface TextareaProps {
  input: string;
  onChangeInput: (input: string) => void;
  isLoading: boolean;
  isLoadingRefinedPrompt?: boolean;
  onPasteFiles?: (files: FileList) => void;
  ref?: React.Ref<HTMLTextAreaElement>;
  containerClassName?: ClassValue;
  textAreaClassName?: ClassValue;
}

export const Textarea = ({
  input,
  onChangeInput,
  isLoadingRefinedPrompt,
  isLoading,
  onPasteFiles,
  containerClassName,
  textAreaClassName,
}: TextareaProps) => {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!CSS.supports("field-sizing", "content") && textAreaRef.current) {
      textAreaRef.current.style.height = "auto";
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (
    e
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        // @ts-expect-error err
        const form = e.target.closest("form");
        if (form) form.requestSubmit();
      }
    }
  };

  return (
    <div
      className={cn(
        "bg-secondary w-full rounded-2xl border-2 border-transparent has-[:focus]:border-ring shadow-xs overflow-hidden",
        containerClassName
      )}
    >
      <PreviewFiles className="m-3" />
      <div
        className={cn(
          "absolute z-3 top-0 bottom-16 pt-4 px-4 left-0 w-full",
          isLoadingRefinedPrompt ? "block" : "hidden"
        )}
      >
        <div className="flex flex-col justify-around h-full w-full">
          <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-2xl py-2 animate-pulse" />
          <div className="w-2/5 bg-gray-200 dark:bg-zinc-700 rounded-2xl mt-2 py-2 animate-pulse" />
        </div>
      </div>
      <TextareaUI
        ref={textAreaRef}
        className={cn(
          "resize-none relative bg-transparent w-full min-h-18 max-h-80 overflow-auto rounded-2xl z-1 pr-12 pt-4 mb-16 mt-2 placeholder:select-none",
          isLoadingRefinedPrompt ? "opacity-0 max-h-18" : "opacity-100",
          textAreaClassName
        )}
        theme="outline"
        value={input}
        onPaste={(e) => {
          e.preventDefault();
          onPasteFiles?.(e.clipboardData.files);
          textAreaRef.current?.setRangeText(
            e.clipboardData.getData("text/plain")
          );
          onChangeInput(textAreaRef.current?.value || "");
        }}
        placeholder={"Say something..."}
        onChange={(e) => onChangeInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
};
