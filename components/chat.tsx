"use client";

import { Textarea } from "./textarea";
import { ProjectOverview } from "./project-overview";
import { Messages } from "./messages";
import { useChatContext } from "../app/providers";
import { ChatControl } from "./chat-control";
import { ArrowUp } from "lucide-react";
import { ChatSettingsButton } from "./chat-settings-button";

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
        className="bg-(--background) w-full max-w-xl mx-auto px-4 sm:px-0 relative"
      >
        <Textarea
          handleInputChange={handleInputChange}
          messages={messages}
          input={input}
          setInput={setInput}
          isLoading={isLoading}
          status={status}
          stop={stop}
        />
        <ChatSettingsButton className="absolute z-1 left-3 bottom-1" />
        <div className="absolute left-13 z-1 bottom-1">{saveChat}</div>
        <ChatControl
          type="submit"
          className="absolute z-1 right-3 bottom-2"
          disabled={!input.trim()}
          isLoading={status === "streaming" || status === "submitted"}
        >
          <ArrowUp className="h-4 w-4 text-white" />
        </ChatControl>
      </form>
    </>
  );
}
