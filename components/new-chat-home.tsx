"use client";
import { Edit } from "lucide-react";
import { Button } from "./ui/button";
import { useChatContext } from "../app/providers";

export const NewChatHome = () => {
  const { setMessages } = useChatContext();
  return (
    <Button
      onClick={() => {
        setMessages([]);
      }}
      variant="outline"
      size="sm"
      className="h-8 px-3 text-zinc-700 dark:text-zinc-200 border-none cursor-pointer"
    >
      <Edit />
    </Button>
  );
};
