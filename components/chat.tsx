"use client";

import { ArrowUp, WandSparkles, Undo } from "lucide-react";
import { useRef } from "react";
import { Textarea } from "@/components/textarea";
import { ProjectOverview } from "@/components/project-overview";
import { Messages } from "@/components/message";
import { ChatControl } from "@/components/chat-control";
import { ChatSettingsButton } from "@/components/chat-settings-button";
import { ToolsControl } from "@/components/tools-control";
import { ScrollToBottomButton } from "@/components/scroll-to-bottom-btn";
import { cn } from "@/lib/utils";
import { useChatContext } from "@/app/providers";
import { useRefinePrompt } from "@/lib/ai/hooks/use-refine-prompt";
import { LoadingMessage } from "@/components/loading-message";
import { AttachmentsControl } from "@/components/attachments-control";
import { ChatReload } from "@/components/chat-reload";
import { handleFileUpload } from "@/lib/ai/utils";
import { getChatConfigurationByModelId } from "@/lib/ai/models/utils";

export interface ChatProps {
  saveChat?: React.ReactNode;
}

const Chat: React.FC<ChatProps> = ({ saveChat }) => {
  const {
    messages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    title,
    status,
    stop,
    data,
    selectedModel,
    setFiles,
    metaPrompt,
  } = useChatContext();
  const { isLoadingRefinedPrompt, refinePrompt, undo, hasPreviousMessage } =
    useRefinePrompt({
      input,
      setInput,
      messages,
      metaPrompt,
      status,
    });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observeRef = useRef<HTMLDivElement>(null);
  const onPaste: React.ClipboardEventHandler<HTMLTextAreaElement> = (e) => {
    handleFileUpload(
      setFiles,
      e.clipboardData.files,
      getChatConfigurationByModelId(selectedModel).supportedFiles
    );
  };

  const isLoading = status === "streaming" || status === "submitted";
  return (
    <>
      <div
        className={cn(
          "w-full pt-16 overflow-hidden relative",
          messages.length && "h-full"
        )}
      >
        <div
          className="h-full overflow-y-auto pb-8 pt-4"
          ref={scrollContainerRef}
        >
          <div className="w-full max-w-4xl px-4 mx-auto">
            {messages.length === 0 ? (
              <ProjectOverview title={title} />
            ) : (
              <>
                <Messages messages={messages} />
                <LoadingMessage
                  metadata={messages[messages.length - 1]?.metadata}
                  status={status}
                  {...(data?.type !== "data-chat" && { data })}
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
        <ScrollToBottomButton
          scrollContainerRef={scrollContainerRef}
          observeRef={observeRef}
        />
      </div>
      <form
        onSubmit={handleSubmit}
        className="bg-(--background) w-full max-w-4xl mx-auto pb-4 px-4"
      >
        <div className="relative w-full">
          <Textarea
            handleInputChange={handleInputChange}
            input={input}
            isLoading={isLoading}
            onPaste={onPaste}
            isLoadingRefinedPrompt={isLoadingRefinedPrompt}
          />
          <div className="absolute left-3 bottom-2 flex items-center space-x-2">
            <ChatSettingsButton />
            {saveChat}
            <ToolsControl />
            <AttachmentsControl />
          </div>

          <div className="absolute right-3 bottom-2 flex items-center space-x-2">
            {hasPreviousMessage && <ChatControl Icon={Undo} onClick={undo} />}
            {metaPrompt && (
              <ChatControl
                Icon={WandSparkles}
                onClick={refinePrompt}
                disabled={!input.length}
                isLoading={isLoadingRefinedPrompt}
              />
            )}
            <ChatControl
              Icon={ArrowUp}
              type="submit"
              disabled={!input.trim() || isLoadingRefinedPrompt}
              isLoading={isLoading}
              onLoadingClick={stop}
            />
          </div>
        </div>
      </form>
    </>
  );
};

export default Chat;
