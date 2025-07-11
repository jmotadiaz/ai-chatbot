"use client";
import { Edit } from "lucide-react";
import { useChatContext } from "@/app/providers";

export const NewChatHome = () => {
  const { setMessages, setInput, status } = useChatContext();
  return (
    <button
      disabled={status === "streaming" || status === "submitted"}
      className="text-zinc-700 dark:text-zinc-200 border-none cursor-pointer disabled:cursor-default disabled:opacity-10"
      onClick={() => {
        setInput("");
        setMessages([]);
      }}
    >
      <Edit size={18} />
    </button>
  );
};
