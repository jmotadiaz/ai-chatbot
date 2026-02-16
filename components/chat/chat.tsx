"use client";

import { ArrowUp, WandSparkles, Undo } from "lucide-react";
import { Textarea } from "@/components/chat/textarea";
import { ChatControl } from "@/components/chat/control";
import { AgentSelector } from "@/components/chat/controls/agent-selector";
import { SettingsControl } from "@/components/chat/controls/settings-control";
import { cn } from "@/lib/utils/helpers";
import { useChatContext } from "@/components/chat/provider";
import { usePromptRefiner } from "@/lib/features/meta-prompt/hooks/use-prompt-refiner";
import { AttachmentsControl } from "@/components/chat/attachments/control";

import { handleFileUpload } from "@/lib/features/attachment/utils";
import { getChatConfigurationByModelId } from "@/lib/features/foundation-model/config";
import { ChatConversation } from "@/components/chat/conversation";

export interface ChatProps {
  className?: string;
}

const Chat: React.FC<ChatProps> = ({ className }) => {
  const {
    messages,
    input,
    setInput,
    files,
    handleSubmit,
    title,
    status,
    sendEnabled,
    stop,
    selectedModel,
    setFiles,
    handleFileChange,
    refinePromptMode,
    projectId,
    agent,
    setAgent,
    temperature,
    topP,
    topK,
    webSearchNumResults,
    ragMaxResources,
    minRagResourcesScore,
    setConfig,
  } = useChatContext();
  const { isLoadingRefinedPrompt, refinePrompt, undo, hasPreviousMessage } =
    usePromptRefiner({
      input,
      setInput,
      messages,
      mode: refinePromptMode,
      status,
      projectId,
    });
  const modelConfig = getChatConfigurationByModelId(selectedModel);

  const onPasteFiles = (files: FileList) => {
    handleFileUpload(setFiles, files, modelConfig.supportedFiles);
  };

  const isLoading = status === "streaming" || status === "submitted";
  return (
    <div
      data-testid="chat-container"
      className={cn(
        "flex flex-col relative",
        messages.length ? "h-full" : "h-vh gap-10",
        className,
      )}
    >
      <ChatConversation
        messages={messages}
        status={status}
        title={title}
        className={cn("pt-4", messages.length && "flex-1")}
        reload={true}
      />
      <form
        onSubmit={handleSubmit}
        className="bg-(--background) w-full max-w-5xl mx-auto pb-4 px-4 relative"
      >
        <div className="relative w-full">
          <Textarea
            onChangeInput={setInput}
            input={input}
            isLoading={isLoading}
            onPasteFiles={onPasteFiles}
            isLoadingRefinedPrompt={isLoadingRefinedPrompt}
            files={files}
            setFiles={setFiles}
          />
          <div className="absolute left-3 bottom-2 flex items-center space-x-2">
            <AttachmentsControl
              handleFileChange={handleFileChange}
              supportedFiles={modelConfig.supportedFiles}
            />
            {!projectId && (
              <AgentSelector value={agent} onValueChange={setAgent} />
            )}
          </div>

          <div className="absolute right-3 bottom-2 flex items-center space-x-2">
            <SettingsControl
              temperature={temperature}
              topP={topP}
              topK={topK}
              webSearchNumResults={webSearchNumResults}
              ragMaxResources={ragMaxResources}
              minRagResourcesScore={minRagResourcesScore}
              agent={agent}
              selectedModel={selectedModel}
              setConfig={setConfig}
            />
            {hasPreviousMessage && (
              <ChatControl
                Icon={Undo}
                onClick={undo}
                aria-label="Undo refined prompt"
              />
            )}
            {refinePromptMode && (
              <ChatControl
                Icon={WandSparkles}
                onClick={refinePrompt}
                disabled={!input.length}
                isLoading={isLoadingRefinedPrompt}
                aria-label="Refine prompt"
              />
            )}
            <ChatControl
              Icon={ArrowUp}
              type="submit"
              aria-label="Send message"
              disabled={!sendEnabled || isLoadingRefinedPrompt}
              isLoading={isLoading}
              onLoadingClick={stop}
            />
          </div>
        </div>
      </form>
    </div>
  );
};

export default Chat;
