"use client";

import React, { useLayoutEffect, useRef } from "react";
import type { ClassValue } from "clsx";
import { Textarea as TextareaUI } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/helpers";
import type { FilePart } from "@/lib/features/attachment/types";
import { HubAttachmentsPreview } from "@/components/chat-hub/hub-attachments-preview";

interface HubTextareaProps {
  input: string;
  onChangeInput: (input: string) => void;
  isLoading: boolean;
  files: FilePart[];
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>;
  containerClassName?: ClassValue;
  textAreaClassName?: ClassValue;
}

export const HubTextarea: React.FC<HubTextareaProps> = ({
  input,
  onChangeInput,
  isLoading,
  files,
  setFiles,
  containerClassName,
  textAreaClassName,
}) => {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!CSS.supports("field-sizing", "content") && textAreaRef.current) {
      textAreaRef.current.style.height = "auto";
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        // @ts-expect-error closest exists
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
      <HubAttachmentsPreview files={files} setFiles={setFiles} className="m-3" />
      <div className="relative">
        <TextareaUI
          ref={textAreaRef}
          data-testid="hub-chat-input"
          className={cn(
            "resize-none relative bg-transparent w-full min-h-18 max-h-80 overflow-auto rounded-2xl z-1 pr-12 pt-4 mb-16 mt-2 placeholder:select-none",
            textAreaClassName
          )}
          theme="outline"
          value={input}
          placeholder={"Compare models..."}
          onChange={(e) => onChangeInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
};


