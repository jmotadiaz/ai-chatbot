"use client";

import { useEffect, useRef, useState } from "react";
import Chat from "./chat";
import { useChatContext } from "../app/providers";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ChatControl } from "./chat-control";
import { SaveIcon } from "lucide-react";
import {
  clearSessionMessages,
  getSessionMessages,
  setMessagesInSession,
} from "@/lib/ai/session";

export default function ChatWithClientStorage() {
  const {
    messages,
    setMessages,
    id: chatId,
    selectedModel,
    temperature,
    topP,
    status,
  } = useChatContext();
  const [isSavingChat, setIsSavingChat] = useState(false);
  const initialized = useRef(false);
  const { push, refresh } = useRouter();
  const isSaveChatEnabled =
    messages.length > 1 &&
    status !== "streaming" &&
    status !== "submitted" &&
    !isSavingChat;

  const onSaveChat = () => {
    setIsSavingChat(true);
    fetch("/api/save-chat", {
      method: "POST",
      body: JSON.stringify({
        messages,
        chatId,
        selectedModel,
        temperature,
        topP,
      }),
    })
      .then(() => {
        clearSessionMessages();
        // Refresh the router cache before navigating to ensure ChatList is refreshed
        refresh();
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
      setMessagesInSession(messages);
    }

    if (!messages.length && initialized.current) {
      clearSessionMessages();
    }

    if (!messages.length && !initialized.current) {
      initialized.current = true;
      setMessages(getSessionMessages());
    }
  }, [messages, setMessages]);

  return (
    <Chat
      saveChat={
        <ChatControl
          Icon={SaveIcon}
          disabled={!isSaveChatEnabled}
          isLoading={isSavingChat}
          onClick={onSaveChat}
        />
      }
    />
  );
}
