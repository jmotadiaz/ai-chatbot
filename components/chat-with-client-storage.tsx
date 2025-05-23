"use client";

import { Message } from "ai";
import { useEffect, useRef, useState } from "react";
import Chat from "./chat";
import { SaveIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { useChatContext } from "../app/providers";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

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
        <>
          {isSavingChat ? (
            <div className="animate-spin h-4 w-4">
              <svg className="h-4 w-4 text-white" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          ) : (
            <button
              className={cn(
                "text-gray-800 dark:text-white p-3 cursor-pointer transition-opacity duration-200",
                messages.length ? "opacity-100" : "opacity-0"
              )}
              disabled={!messages.length}
              onClick={onSaveChat}
            >
              <SaveIcon className="h-5 w-5 " />
            </button>
          )}
        </>
      }
    />
  );
}
