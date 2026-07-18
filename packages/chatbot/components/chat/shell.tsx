"use client";

import React, { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChatProvider,
  type ChatProviderProps,
} from "@/components/chat/provider";
import { useChatLifecycleShell } from "@/components/chat/lifecycle-shell";

export interface ChatShellProps {
  children: React.ReactNode;
  chatConfig: Omit<ChatProviderProps, "children">;
}

export const ChatShell: React.FC<ChatShellProps> = ({
  children,
  chatConfig,
}) => {
  const searchParams = useSearchParams();
  const chatType = searchParams.get("chatType");
  const isTemporary = chatType === "temporary";

  // If the server didn't provide a chatId, we're in a "new chat" flow.
  const isNewChat = !chatConfig.chatId;

  // Get the draftChatId from the parent ChatLifecycleShell
  const { draftChatId } = useChatLifecycleShell();

  const effectiveChatId = isNewChat ? draftChatId : chatConfig.chatId;
  const providerKey = `${effectiveChatId ?? "chat"}:${
    isTemporary ? "tmp" : "perm"
  }`;

  const providerProps = useMemo<Omit<ChatProviderProps, "children">>(() => {
    return {
      ...chatConfig,
      chatId: effectiveChatId,
      isNewChat,
      preventChatPersistence: isTemporary,
    };
  }, [chatConfig, effectiveChatId, isNewChat, isTemporary]);

  return (
    <ChatProvider key={providerKey} {...providerProps}>
      {children}
    </ChatProvider>
  );
};
