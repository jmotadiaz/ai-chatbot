"use client";

import * as React from "react";
import { ArrowUp } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils/helpers";
import { ChatControl } from "@/components/chat-control";
import { useChatHub } from "@/lib/features/chat/hub/hooks/use-chat-hub";
import { HubInstancePanel } from "@/components/chat-hub/instance-panel";
import { AddModelDropdown } from "@/components/chat-hub/add-model-dropdown";
import { HubAttachmentsControl } from "@/components/chat-hub/hub-attachments-control";
import { HubToolsControl } from "@/components/chat-hub/hub-tools-control";
import { HubTextarea } from "@/components/chat-hub/hub-textarea";

export interface HubClientProps {
  className?: string;
}

export const HubClient: React.FC<HubClientProps> = ({ className }) => {
  const hub = useChatHub();
  const containerClassName = "w-full max-w-6xl 2xl:max-w-screen-2xl mx-auto px-4";

  const tabIds = React.useMemo(() => {
    const ids = hub.instances.map((i) => i.id);
    return hub.instances.length < 4 && !hub.instancesLocked
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
        <div className={cn("hidden 2xl:block h-full min-h-0", containerClassName)}>
          <div className="grid grid-cols-2 gap-4 h-full min-h-0 auto-rows-fr">
            {hub.instances.map((inst) => (
              <HubInstancePanel
                key={inst.id}
                instance={inst}
                submitSubscribe={hub.submitSubscribe}
                tools={hub.tools}
                onRemove={hub.removeInstance}
                persistChat={hub.persistChat}
                isPersisting={hub.isPersisting}
                persistingInstanceId={hub.persistingInstanceId}
                className="h-full"
              />
            ))}

            {hub.instances.length < 4 && !hub.instancesLocked && (
              <div className={cn(hub.instances.length === 0 && "col-span-2")}>
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

        {/* Mobile tabs */}
        <div className={cn("2xl:hidden h-full flex flex-col", containerClassName)}>
          <Tabs.Container>
            {hub.instances.map((inst) => (
              <Tabs.Tab
                key={inst.id}
                active={activeTab === inst.id}
                onClick={() => setActiveTab(inst.id)}
              >
                {inst.model}
              </Tabs.Tab>
            ))}
            {hub.instances.length < 4 && !hub.instancesLocked && (
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
                key={inst.id}
                className={cn("h-full", activeTab !== inst.id && "hidden")}
              >
                <HubInstancePanel
                  instance={inst}
                  submitSubscribe={hub.submitSubscribe}
                  tools={hub.tools}
                  onRemove={hub.removeInstance}
                  persistChat={hub.persistChat}
                  isPersisting={hub.isPersisting}
                  persistingInstanceId={hub.persistingInstanceId}
                  className="h-full"
                />
              </div>
            ))}

            {hub.instances.length < 4 && !hub.instancesLocked && (
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
        className={cn("bg-(--background) pb-4", containerClassName)}
      >
        <div className="relative w-full">
          <HubTextarea
            input={hub.input}
            onChangeInput={hub.setInput}
            isLoading={isLoading}
            files={hub.files}
            setFiles={hub.setFiles}
          />

          <div className="absolute left-3 bottom-2 flex items-center space-x-2">
            <HubAttachmentsControl
              handleFileChange={hub.handleFileChange}
              availableModels={hub.availableModels}
              instances={hub.instances}
            />
            <HubToolsControl
              tools={hub.tools}
              toggleTool={hub.toggleTool}
              hasTool={hub.hasTool}
              instances={hub.instances}
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


