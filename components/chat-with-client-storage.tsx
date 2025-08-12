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
  clearChatDataInSession,
  getSessionChatData,
  setChatDataInSession,
} from "@/lib/ai/client-session";

const ChatWithClientStorage: React.FC = () => {
  const {
    messages,
    setMessages,
    id: chatId,
    selectedModel,
    temperature,
    topP,
    topK,
    status,
    tools,
    projectId,
    setConfig,
    setTools,
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
        topK,
        tools,
      });
      clearChatDataInSession();
      push(`/${chatId}`);
    } catch (error) {
      toast.error("Error saving chat");
      console.error("Error saving chat", error);
    } finally {
      setIsSavingChat(false);
    }
  };

  useEffect(() => {
    if (initialized.current) {
      setChatDataInSession({
        messages,
        chatConfig: { selectedModel, temperature, topP },
        tools,
      });
    } else {
      initialized.current = true;
      const sessionData = getSessionChatData();
      if (sessionData.messages) {
        setMessages(sessionData.messages);
      }
      if (sessionData.chatConfig) {
        setConfig(sessionData.chatConfig);
      }
      if (sessionData.tools) {
        setTools(sessionData.tools);
      }
    }
  }, [
    messages,
    selectedModel,
    setConfig,
    setMessages,
    setTools,
    temperature,
    tools,
    topP,
  ]);

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
