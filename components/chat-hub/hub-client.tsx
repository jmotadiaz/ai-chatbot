"use client";

import * as React from "react";
import { ArrowUp } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils/helpers";
import { ChatControl } from "@/components/chat-control";
import { useChatHub } from "@/lib/features/chat/hub/hooks/use-chat-hub";
import { HubInstancePanel } from "@/components/chat-hub/instance-panel";
import { AddModelDropdown } from "@/components/chat-hub/add-model-dropdown";
import { Textarea } from "@/components/textarea";
import { AttachmentsControl } from "@/components/attachments-control";
import { ToolsControl } from "@/components/tools-control";

export interface HubClientProps {
  className?: string;
}

export const HubClient: React.FC<HubClientProps> = ({ className }) => {
  const hub = useChatHub();
  const inputContainerClassName = "w-full max-w-5xl mx-auto px-4";

  const panelsContainerClassName = React.useMemo(() => {
    const showAddModelTile = hub.instances.length < 3 && !hub.instancesLocked;
    const visibleSlotsCount = hub.instances.length + (showAddModelTile ? 1 : 0);

    // Keep mobile tabs/panels aligned with the textarea width (max-w-5xl),
    // while still allowing a wider desktop grid at 2xl+.
    const base = "w-full max-w-5xl mx-auto px-4";
    const desktopMaxWidth =
      visibleSlotsCount <= 1
        ? "2xl:max-w-5xl"
        : visibleSlotsCount === 2
          ? "2xl:max-w-screen-2xl"
          : "2xl:max-w-[120rem]";
    return cn(base, desktopMaxWidth);
  }, [hub.instances.length, hub.instancesLocked]);

  const tabIds = React.useMemo(() => {
    const ids = hub.instances.map((i) => i.chatId);
    return hub.instances.length < 3 && !hub.instancesLocked
      ? [...ids, "new-model"]
      : ids;
  }, [hub.instances, hub.instancesLocked]);

  const [activeTab, setActiveTab] = React.useState<string>(() => tabIds[0] ?? "new-model");

  // Keep active tab valid when instances are added/removed or hub locks.
  React.useEffect(() => {
    if (tabIds.length === 0) {
      setActiveTab("new-model");
      return;
    }
    if (!tabIds.includes(activeTab)) {
      setActiveTab(tabIds[0]);
    }
  }, [activeTab, tabIds]);

  const isLoading = false; // hub doesn’t have a unified loading state

  return (
    <div className={cn("flex flex-col h-full w-full", className)}>
      {/* Top area (panels) */}
      <div className="flex-1 w-full pb-6 min-h-0">
        {/* Desktop grid */}
        <div className={cn("hidden 2xl:block h-full min-h-0", panelsContainerClassName)}>
          <div className="grid grid-flow-col auto-cols-fr gap-4 h-full min-h-0">
            {hub.instances.map((inst) => (
              <HubInstancePanel
                key={inst.chatId}
                instance={inst}
                submitSubscribe={hub.submitSubscribe}
                tools={hub.tools}
                onRemove={hub.removeInstance}
                persistChat={hub.persistChat}
                isPersisting={hub.isPersisting}
                persistingChatId={hub.persistingChatId}
                className="h-full"
              />
            ))}

            {hub.instances.length < 3 && !hub.instancesLocked && (
              <AddModelDropdown
                availableModels={hub.availableModels}
                onSelectModel={(model) => hub.addInstance(model)}
                triggerClassName={cn(
                  "w-full h-full rounded-xl border border-dashed bg-secondary/30"
                )}
                triggerLabel="Add Model"
                variant="tile"
              />
            )}
          </div>
        </div>

        {/* Mobile tabs */}
        <div className={cn("2xl:hidden h-full flex flex-col", panelsContainerClassName)}>
          <Tabs.Container>
            {hub.instances.map((inst) => (
              <Tabs.Tab
                key={inst.chatId}
                active={activeTab === inst.chatId}
                onClick={() => setActiveTab(inst.chatId)}
              >
                {inst.model}
              </Tabs.Tab>
            ))}
            {hub.instances.length < 3 && !hub.instancesLocked && (
              <Tabs.Tab
                active={activeTab === "new-model"}
                onClick={() => setActiveTab("new-model")}
              >
                New Model
              </Tabs.Tab>
            )}
          </Tabs.Container>

          <div className="pt-4 flex-1 min-h-0">
            {hub.instances.map((inst) => (
              <div
                key={inst.chatId}
                className={cn("h-full", activeTab !== inst.chatId && "hidden")}
              >
                <HubInstancePanel
                  instance={inst}
                  submitSubscribe={hub.submitSubscribe}
                  tools={hub.tools}
                  onRemove={hub.removeInstance}
                  persistChat={hub.persistChat}
                  isPersisting={hub.isPersisting}
                  persistingChatId={hub.persistingChatId}
                  className="h-full"
                />
              </div>
            ))}

            {hub.instances.length < 3 && !hub.instancesLocked && (
              <div className={cn("h-full", activeTab !== "new-model" && "hidden")}>
                <AddModelDropdown
                  availableModels={hub.availableModels}
                  onSelectModel={(model) => hub.addInstance(model)}
                  triggerClassName={cn(
                    "w-full h-full rounded-xl border border-dashed bg-secondary/30"
                  )}
                  triggerLabel="Add Model"
                  variant="tile"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Global hub form (bottom) */}
      <form
        onSubmit={hub.handleSubmit}
        className={cn("bg-(--background) pb-4", inputContainerClassName)}
      >
        <div className="relative w-full">
          <Textarea
            input={hub.input}
            onChangeInput={hub.setInput}
            isLoading={isLoading}
            files={hub.files}
            setFiles={hub.setFiles}
            placeholder="Compare models..."
          />

          <div className="absolute left-3 bottom-2 flex items-center space-x-2">
            <AttachmentsControl
              handleFileChange={hub.handleFileChange}
              supportedFiles={hub.supportedFilesForPicker}
            />
            <ToolsControl
              tools={hub.tools}
              toggleTool={hub.toggleTool}
              hasTool={hub.hasTool}
              enabled={hub.toolsEnabled}
            />
          </div>

          <div className="absolute right-3 bottom-2 flex items-center space-x-2">
            <ChatControl
              Icon={ArrowUp}
              type="submit"
              aria-label="Send message"
              disabled={!hub.sendEnabled}
              isLoading={isLoading}
            />
          </div>
        </div>
      </form>
    </div>
  );
};


