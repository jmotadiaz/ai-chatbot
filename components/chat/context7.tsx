"use client";

import React from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { useContext7ChatContext } from "@/components/chat/context7/provider";
import { ChatConversation } from "@/components/chat/conversation";
import { Textarea } from "@/components/chat/textarea";
import { ChatControl } from "@/components/chat/control";
import { AttachmentsControl } from "@/components/chat/attachments/control";

export const Context7Chat: React.FC = () => {
  const {
    messages,
    input,
    setInput,
    status,
    handleSubmit,
    sendEnabled,
    stop,
    files,
    setFiles,
    handleFileChange,
    supportedFiles,
  } = useContext7ChatContext();

  const isLoading = status === "streaming" || status === "submitted";

  return (
    <div
      data-testid="context7-interface"
      className={cn(
        "flex flex-col relative pt-16",
        messages.length ? "h-full" : "h-vh gap-10",
      )}
    >
      <ChatConversation
        messages={messages}
        status={status}
        title="Context7 Agent"
        className={cn("pt-4", messages.length && "flex-1")}
        reload={false}
      />

      <form
        onSubmit={handleSubmit}
        className="bg-(--background) w-full max-w-5xl mx-auto pb-4 px-4 relative mt-auto"
      >
        <div className="relative w-full">
          <Textarea
            input={input}
            onChangeInput={setInput}
            isLoading={isLoading}
            files={files}
            setFiles={setFiles}
            placeholder="Ask anything..."
          />
          <div className="absolute right-3 bottom-2 flex items-center space-x-2">
            <AttachmentsControl
              handleFileChange={handleFileChange}
              supportedFiles={supportedFiles}
            />
            <ChatControl
              Icon={ArrowUp}
              type="submit"
              aria-label="Send message"
              disabled={!sendEnabled}
              isLoading={isLoading}
              onLoadingClick={stop}
            />
          </div>
        </div>
      </form>
    </div>
  );
};
