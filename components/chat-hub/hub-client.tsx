"use client";

import { useState } from "react";
import { Textarea } from "@/components/textarea";
import { ToolsControl } from "@/components/tools-control";
import { AttachmentsControl } from "@/components/attachments-control";
import { cn } from "@/lib/utils/helpers";
import type { ClassValue } from "clsx";

interface HubClientProps {
  className?: ClassValue;
}

export const HubClient = ({ className }: HubClientProps) => {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());

  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      <h1 className="text-2xl font-bold">Chat Hub</h1>
      <div className="w-full max-w-3xl mx-auto border rounded-2xl p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            console.log("Submit:", input, attachments, selectedTools);
          }}
          className="relative"
        >
          <Textarea
            input={input}
            onChangeInput={setInput}
            isLoading={false}
            attachments={attachments}
            setAttachments={setAttachments}
          />
          <div className="flex flex-row items-center justify-between p-2 absolute bottom-2 left-2 right-2">
            <div className="flex flex-row items-center gap-2">
              <AttachmentsControl
                attachments={attachments}
                setAttachments={setAttachments}
              />
              <ToolsControl
                selectedTools={selectedTools}
                setSelectedTools={setSelectedTools}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
