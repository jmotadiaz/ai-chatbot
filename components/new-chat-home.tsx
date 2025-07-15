"use client";
import { Edit } from "lucide-react";
import { useChatContext } from "@/app/providers";

export const NewChatHome = () => {
  const { setMessages, setInput, status } = useChatContext();
  return (
    <button
      disabled={status === "streaming" || status === "submitted"}
      className="p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer disabled:cursor-default disabled:opacity-10"
      onClick={() => {
        setInput("");
        setMessages([]);
      }}
    >
      <Edit size={18} />
    </button>
  );
};
