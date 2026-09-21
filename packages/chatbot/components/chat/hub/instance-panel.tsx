"use client";

import React, { useCallback } from "react";
import { Trash2, Save } from "lucide-react";
import type { ChatMode } from "@/lib/features/chat/types";
import type { HubInstance, ChatHub } from "@/lib/features/chat/hub/types";
import { useChatHubInstance } from "@/lib/features/chat/hub/hooks/use-chat-hub-instance";
import { Button, buttonVariants } from "@/components/ui/button";
import { capitalize, cn } from "@/lib/utils/helpers";
import { ChatConversation } from "@/components/chat/conversation";
import { ChatModeSelector } from "@/components/chat/controls/chat-mode-selector";
import { SettingsControl } from "@/components/chat/controls/settings-control";

export interface HubInstancePanelProps {
  instance: HubInstance;
  submitSubscribe: ChatHub["submitSubscribe"];
  onRemove: (id: string) => Promise<void>;
  updateInstanceChatMode: (chatId: string, chatMode: ChatMode) => void;
  updateInstanceConfig: ChatHub["updateInstanceConfig"];
  persistChat: ChatHub["persistChat"];
  isPersisting: boolean;
  persistingChatId: string | null;
  isPersisted: boolean;
  className?: string;
  layoutMode?: "grid" | "tabs";
}

export const HubInstancePanel: React.FC<HubInstancePanelProps> = ({
  instance,
  submitSubscribe,
  onRemove,
  updateInstanceChatMode,
  updateInstanceConfig,
  persistChat,
  isPersisting,
  persistingChatId,
  isPersisted,
  className,
  layoutMode = "grid",
}) => {
  const chat = useChatHubInstance({
    chatId: instance.chatId,
    model: instance.model,
    submitSubscribe,
    chatMode: instance.chatMode,
    preventChatPersistence: true,
    ...instance.configuration,
  });

  const onSelectThisChat = useCallback(async () => {
    await persistChat({
      chatId: instance.chatId,
      messages: chat.messages,
      model: instance.model,
      chatMode: instance.chatMode,
      temperature: chat.temperature,
      topP: chat.topP,
      topK: chat.topK,
      webSearchNumResults: chat.webSearchNumResults,
      ragMaxResources: chat.ragMaxResources,
      minRagResourcesScore: chat.minRagResourcesScore,
    });
    // Removed navigation: router.push(...)
  }, [
    chat.messages,
    instance.chatId,
    instance.model,
    instance.chatMode,
    chat.temperature,
    chat.topP,
    chat.topK,
    chat.webSearchNumResults,
    chat.ragMaxResources,
    chat.minRagResourcesScore,
    persistChat,
  ]);

  const isThisPersisting = isPersisting && persistingChatId === instance.chatId;

  const handleSetConfig = useCallback(
    (
      config: Partial<
        import("@/lib/features/chat/conversation/hooks/hook-types").ChatConfig
      >,
    ) => {
      updateInstanceConfig(instance.chatId, config);
    },
    [instance.chatId, updateInstanceConfig],
  );

  return (
    <div
      data-testid="hub-instance-panel"
      className={cn(
        "rounded-xl border bg-secondary/30 h-full min-h-0 flex flex-col",
        className,
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {layoutMode === "grid" && (
            <div
              className="font-semibold truncate min-w-0 flex-1"
              title={instance.model}
            >
              {instance.model}
            </div>
          )}
          {!isPersisted && (
            <ChatModeSelector
              value={instance.chatMode}
              onValueChange={(chatMode) =>
                updateInstanceChatMode(instance.chatId, chatMode)
              }
              variant="bottom-right"
              className="shrink-0"
            />
          )}
        </div>

        <div className="flex items-center gap-2 ml-2">
          {!isPersisted && (
            <SettingsControl
              temperature={chat.temperature}
              topP={chat.topP}
              topK={chat.topK}
              webSearchNumResults={chat.webSearchNumResults}
              ragMaxResources={chat.ragMaxResources}
              minRagResourcesScore={chat.minRagResourcesScore}
              chatMode={instance.chatMode}
              setConfig={handleSetConfig}
              dropdownVariant="responsive-bottom-left"
              className={buttonVariants({
                variant: "icon",
                size: "icon",
              })}
            />
          )}

          {isPersisted ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onRemove(instance.chatId)}
            >
              Delete chat
            </Button>
          ) : (
            <Button
              variant="icon"
              size="icon"
              onClick={onSelectThisChat}
              isLoading={isThisPersisting}
              disabled={isPersisting || chat.messages.length === 0}
              aria-label="Save chat"
            >
              <Save />
            </Button>
          )}

          {!isPersisted && (
            <Button
              variant="icon"
              size="icon"
              aria-label="Remove instance"
              onClick={() => onRemove(instance.chatId)}
              disabled={isPersisting}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <ChatConversation
        messages={chat.messages}
        status={chat.status}
        title={instance.model}
        description={`Chat Mode: ${capitalize(instance.chatMode)}`}
        overviewSize="compact"
        className={cn(
          "flex-1 flex",
          chat.messages.length ? "items-start" : "items-center",
        )}
      />
    </div>
  );
};
