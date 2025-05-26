"use client";

import { Textarea } from "./textarea";
import { ProjectOverview } from "./project-overview";
import { Messages } from "./messages";
import { useChatContext } from "../app/providers";
import { ChatControl } from "./chat-control";
import { ChatSettingsButton } from "./chat-settings-button";
import { useRefinePrompt } from "@/lib/ai/hooks";
import { ArrowUp, Pencil } from "lucide-react";

export interface ChatProps {
  saveChat?: React.ReactNode;
}

export default function Chat({ saveChat }: ChatProps) {
  const {
    messages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    status,
    stop,
  } = useChatContext();
  const { isLoadingRefinedPrompt, refinePrompt } = useRefinePrompt({
    input,
    setInput,
    messages,
  });

  const isLoading = status === "streaming" || status === "submitted";

  return (
    <>
      {messages.length === 0 ? (
        <div className="max-w-xl mx-auto w-full pt-16">
          <ProjectOverview />
        </div>
      ) : (
        <Messages messages={messages} isLoading={isLoading} status={status} />
      )}
      <form
        onSubmit={handleSubmit}
        className="bg-(--background) w-full max-w-xl mx-auto pb-4 px-4 sm:px-0"
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
            disabled={!input.trim()}
            isLoading={isLoading}
          />
        </div>
      </form>
    </>
  );
}
