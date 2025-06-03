"use client";

import { Textarea } from "./textarea";
import { ProjectOverview } from "./project-overview";
import { Messages } from "./messages";
import { useChatContext } from "../app/providers";
import { ChatControl } from "./chat-control";
import { ChatSettingsButton } from "./chat-settings-button";
import { useRefinePrompt } from "@/lib/ai/hooks";
import { ArrowUp, Pencil, RefreshCcw, Circle } from "lucide-react";
import { cn } from "../lib/utils";
import { ScrollToBottomButton } from "./scroll-to-bottom-btn";
import { useRef } from "react";

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
    status,
    stop,
    reload,
    chatId,
  } = useChatContext();
  const { isLoadingRefinedPrompt, refinePrompt } = useRefinePrompt({
    input,
    setInput,
    messages,
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observeRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "streaming" || status === "submitted";

  return (
    <>
      <div
        className={cn(
          "w-full pt-16 overflow-hidden relative",
          messages.length && "h-full"
        )}
      >
        <div className="h-full overflow-y-auto py-8" ref={scrollContainerRef}>
          <div className="w-full max-w-2xl mx-auto">
            {messages.length === 0 ? (
              <ProjectOverview />
            ) : (
              <>
                <Messages
                  messages={messages}
                  isLoading={isLoading}
                  status={status}
                />
                {status === "submitted" && (
                  <div className="flex items-center gap-2 ml-5 mt-2">
                    <Circle
                      size={2}
                      className="w-2 h-2 fill-gray-400 text-gray-400 animate-[typing_1.5s_ease-in-out_infinite]"
                    />
                    <Circle
                      size={2}
                      className="w-2 h-2 fill-gray-400 text-gray-400 animate-[typing_1.5s_ease-in-out_infinite] [animation-delay:0.2s]"
                    />
                    <Circle
                      size={2}
                      className="w-2 h-2 fill-gray-400 text-gray-400 animate-[typing_1.5s_ease-in-out_infinite] [animation-delay:0.4s]"
                    />
                  </div>
                )}
                {!chatId && status === "ready" && (
                  <div className="flex mt-1 ml-3">
                    <div
                      className="p-2 border dark:border-zinc-500 rounded-full cursor-pointer"
                      onClick={() => reload()}
                    >
                      <RefreshCcw size={16} className="dark:text-white" />
                    </div>
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
        className="bg-(--background) w-full max-w-2xl mx-auto pb-4 px-4 sm:px-0"
      >
        <div className="relative w-full">
          <Textarea
            handleInputChange={handleInputChange}
            messages={messages}
            input={input}
            setInput={setInput}
            isLoading={isLoading}
            isLoadingRefinedPrompt={isLoadingRefinedPrompt}
            status={status}
            stop={stop}
          />
          <ChatSettingsButton className="absolute z-1 left-3 bottom-2" />
          <div className="absolute left-13 z-1 bottom-2">{saveChat}</div>
          <ChatControl
            Icon={Pencil}
            className="absolute z-1 right-13 bottom-2"
            onClick={refinePrompt}
            disabled={!input.length}
            isLoading={isLoadingRefinedPrompt}
          />
          <ChatControl
            Icon={ArrowUp}
            type="submit"
            className="absolute z-1 right-3 bottom-2"
            disabled={!input.trim() || isLoadingRefinedPrompt || isLoading}
            isLoading={isLoading}
          />
        </div>
      </form>
    </>
  );
};

export default Chat;
