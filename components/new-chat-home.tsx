"use client";
import { Edit } from "lucide-react";
import { useChatContext } from "@/app/providers";
import { defaultModel } from "@/lib/ai/models/definition";

export const NewChatHome = () => {
  const { setMessages, setInput, setFiles, status, setConfig, setTools } =
    useChatContext();
  return (
    <button
      disabled={status === "streaming" || status === "submitted"}
      className="p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer disabled:cursor-default disabled:opacity-10"
      onClick={() => {
        setInput("");
        setMessages([]);
        setFiles([]);
        setTools([]);
        setConfig({
          selectedModel: defaultModel,
        });
      }}
    >
      <Edit size={18} />
    </button>
  );
};
