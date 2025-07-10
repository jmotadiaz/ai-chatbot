"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { SaveIcon } from "lucide-react";
import { useChatContext } from "@/app/providers";
import { ChatControl } from "@/components/chat-control";
import Chat from "@/components/chat";
import { saveChat } from "@/lib/ai/actions/chat";
import {
  clearSessionMessages,
  getSessionMessages,
  setMessagesInSession,
} from "@/lib/ai/session";

const ChatWithClientStorage: React.FC = () => {
  const {
    messages,
    setMessages,
    id: chatId,
    selectedModel,
    temperature,
    topP,
    status,
    projectId,
  } = useChatContext();
  const [isSavingChat, setIsSavingChat] = useState(false);
  const initialized = useRef(false);
  const { push } = useRouter();
  const isSaveChatEnabled =
    messages.length > 1 &&
    status !== "streaming" &&
    status !== "submitted" &&
    !isSavingChat;

  const onSaveChat = async () => {
    setIsSavingChat(true);
    try {
      await saveChat({
        messages,
        projectId,
        chatId,
        selectedModel,
        temperature,
        topP,
      });
      clearSessionMessages();
      push(`/${chatId}`);
    } catch (error) {
      toast.error("Error saving chat");
      console.error("Error saving chat", error);
    } finally {
      setIsSavingChat(false);
    }
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
};

export default ChatWithClientStorage;
