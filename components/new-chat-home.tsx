"use client";
import { Edit } from "lucide-react";
import { useChatContext } from "@/app/providers";

export const NewChatHome = () => {
  const { setMessages } = useChatContext();
  return (
    <span
      className=" text-zinc-700 dark:text-zinc-200 border-none cursor-pointer"
      onClick={() => {
        setMessages([]);
      }}
    >
      <Edit size={18} />
    </span>
  );
};
