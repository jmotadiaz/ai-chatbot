"use client";

import { ArrowUp, WandSparkles, Undo } from "lucide-react";
import { useRef } from "react";
import { Textarea } from "@/components/textarea";
import { ProjectOverview } from "@/components/project-overview";
import { Messages } from "@/components/message";
import { ChatControl } from "@/components/chat-control";
import { ChatSettingsButton } from "@/components/chat-settings-button";
import { ToolsControl } from "@/components/tools-control";
import { ChatNavigation } from "@/components/chat-navigation";
import { cn } from "@/lib/utils/helpers";
import { useChatContext } from "@/app/(chat)/chat-provider";
import { usePromptRefiner } from "@/lib/features/meta-prompt/hooks/use-prompt-refiner";
import { LoadingMessage } from "@/components/loading-message";
import { AttachmentsControl } from "@/components/attachments-control";
import { ChatReload } from "@/components/chat-reload";

import { handleFileUpload } from "@/lib/features/attachment/utils";
import { getChatConfigurationByModelId } from "@/lib/features/foundation-model/helpers";

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
    dataPart,
    selectedModel,
    setFiles,
    handleFileChange,
    tools,
    toggleTool,
    hasTool,
    metaPrompt,
  } = useChatContext();
  const { isLoadingRefinedPrompt, refinePrompt, undo, hasPreviousMessage } =
    usePromptRefiner({
      input,
      setInput,
      messages,
      metaPrompt,
      status,
    });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observeRef = useRef<HTMLDivElement>(null);
  const modelConfig = getChatConfigurationByModelId(selectedModel);

  const onPasteFiles = (files: FileList) => {
    handleFileUpload(setFiles, files, modelConfig.supportedFiles);
  };

  const isLoading = status === "streaming" || status === "submitted";
  return (
    <div
      data-testid="chat-container"
      className={cn(
        "flex flex-col",
        messages.length ? "h-full" : "h-vh",
        className
      )}
    >
      <div
        className={cn(
          "w-full overflow-hidden relative",
          messages.length && "h-full"
        )}
      >
        <div
          className="h-full overflow-y-auto pb-8 pt-4"
          ref={scrollContainerRef}
        >
          <div className={cn("w-full max-w-5xl px-4 mx-auto")}>
            {messages.length === 0 ? (
              <ProjectOverview title={title} />
            ) : (
              <>
                <Messages messages={messages} />
                <LoadingMessage
                  message={messages[messages.length - 1]}
                  status={status}
                  {...(dataPart?.type !== "data-chat" && { dataPart })}
                />
                {(status === "ready" || status === "error") && (
                  <div className="mt-1 ml-4">
                    <ChatReload />
                  </div>
                )}
              </>
            )}

            <div className="h1" ref={observeRef}></div>
          </div>
        </div>
        <ChatNavigation
          scrollContainerRef={scrollContainerRef}
          messages={messages}
        />
      </div>
      <form
        onSubmit={handleSubmit}
        className="bg-(--background) w-full max-w-5xl mx-auto pb-4 px-4"
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
            <ToolsControl
              tools={tools}
              toggleTool={toggleTool}
              hasTool={hasTool}
              enabled={modelConfig.toolCalling}
            />
          </div>

          <div className="absolute right-3 bottom-2 flex items-center space-x-2">
            <ChatSettingsButton />
            {hasPreviousMessage && (
              <ChatControl
                Icon={Undo}
                onClick={undo}
                aria-label="Undo refined prompt"
              />
            )}
            {metaPrompt && (
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
