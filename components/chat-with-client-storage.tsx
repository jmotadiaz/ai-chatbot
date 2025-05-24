"use client";

import { Message } from "ai";
import { useEffect, useRef, useState } from "react";
import Chat from "./chat";
import { SaveIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { useChatContext } from "../app/providers";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ChatControl } from "./chat-control";

const SESSION_STORAGE_KEY = "messages";

export default function ChatWithClientStorage() {
  const { messages, setMessages, id: chatId, selectedModel } = useChatContext();
  const [isSavingChat, setIsSavingChat] = useState(false);
  const initialized = useRef(false);
  const { push } = useRouter();

  const onSaveChat = () => {
    setIsSavingChat(true);
    fetch("/api/save-chat", {
      method: "POST",
      body: JSON.stringify({ messages, chatId, selectedModel }),
    })
      .then(() => {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify([]));
        push(`/${chatId}`);
      })
      .catch((error) => {
        toast.error("Error saving chat");
        console.error("Error saving chat", error);
      })
      .finally(() => {
        setIsSavingChat(false);
      });
  };

  useEffect(() => {
    if (messages.length && initialized.current) {
      window.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(messages)
      );
    }

    if (!messages.length && initialized.current) {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify([]));
    }

    if (!messages.length && !initialized.current) {
      initialized.current = true;
      try {
        const storedMessages = JSON.parse(
          window.sessionStorage.getItem(SESSION_STORAGE_KEY) || "[]"
        ) as Message[];
        setMessages(storedMessages || []);
      } catch {}
    }
  }, [messages, setMessages]);

  return (
    <Chat
      saveChat={
        <ChatControl
          className={cn(messages.length ? "opacity-100" : "opacity-0")}
          disabled={!messages.length}
          isLoading={isSavingChat}
          onClick={onSaveChat}
        >
          <SaveIcon className="h-4 w-4 text-white" />
        </ChatControl>
      }
    />
  );
}
