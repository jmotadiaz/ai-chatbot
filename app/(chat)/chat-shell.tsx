"use client";

import React, { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { ChatProvider, type ChatProviderProps } from "@/app/(chat)/chat-provider";
import { ChatLifecycleProvider } from "@/app/(chat)/chat-lifecycle";

export interface ChatShellProps {
  children: React.ReactNode;
  chatConfig: Omit<ChatProviderProps, "children">;
}

export const ChatShell: React.FC<ChatShellProps> = ({ children, chatConfig }) => {
  const searchParams = useSearchParams();
  const chatType = searchParams.get("chatType");
  const isTemporary = chatType === "temporary";

  // If the server didn't provide a chatId, we're in a "new chat" flow.
  const isNewChat = !chatConfig.chatId;

  const [draftChatId, setDraftChatId] = useState<string>(() => uuidv4());

  const effectiveChatId = isNewChat ? draftChatId : chatConfig.chatId;
  const providerKey = `${effectiveChatId ?? "chat"}:${isTemporary ? "tmp" : "perm"}`;

  const startNewChat = () => {
    setDraftChatId(uuidv4());
  };

  const providerProps = useMemo<Omit<ChatProviderProps, "children">>(() => {
    return {
      ...chatConfig,
      chatId: effectiveChatId,
      isNewChat,
      preventChatPersistence: isTemporary,
    };
  }, [chatConfig, effectiveChatId, isNewChat, isTemporary]);

  return (
    <ChatLifecycleProvider startNewChat={startNewChat}>
      <ChatProvider key={providerKey} {...providerProps}>
        {children}
      </ChatProvider>
    </ChatLifecycleProvider>
  );
};


