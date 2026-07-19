"use client";

import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { AgentConversation } from "./agent-conversation";
import { useFileBrowser } from "./file-browser/file-browser-provider";
import { PendingCommentsBar } from "./file-browser/pending-comments-bar";
import { serializeComments } from "./file-browser/serialize-comments";
import { Textarea } from "@/components/chat/textarea";
import { ChatControl } from "@/components/chat/control";
import { useCodingAgent } from "@/lib/features/code/hooks/use-coding-agent";

export interface AgentCodeChatProps {
  project: string;
  sessionId: string;
  modelId: string;
}

export const AgentCodeChat: React.FC<AgentCodeChatProps> = ({
  project,
  sessionId,
  modelId,
}) => {
  const [input, setInput] = useState("");
  const { items, turnFiles, isRunning, isLoading, sendMessage, status, error } =
    useCodingAgent({
      project,
      sessionId,
      modelId,
    });

  const { state: fileBrowserState, actions: fileBrowserActions } =
    useFileBrowser();
  const pendingComments = fileBrowserState.pendingComments;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = serializeComments(input, pendingComments);
    if (!message) return;
    setInput("");
    fileBrowserActions.clearComments();
    await sendMessage(message);
  };

  // No model yet means the session's model is still being fetched from the
  // worker (picker shows a skeleton): sending must wait for it too.
  const inputIsLoading = isRunning || isLoading || !modelId;

  return (
    <div
      data-testid="chat-container"
      className="flex flex-col relative h-full pt-16"
    >
      <AgentConversation
        items={items}
        isRunning={isRunning}
        status={status}
        turnFiles={turnFiles}
      />
      {error && (
        <div role="alert" className="text-xs text-red-600 px-4 py-1">
          {error}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="bg-(--background) w-full max-w-5xl mx-auto pb-4 px-4 relative"
      >
        <PendingCommentsBar />
        <div className="relative w-full">
          <Textarea
            onChangeInput={setInput}
            input={input}
            isLoading={inputIsLoading}
            placeholder="Ask the coding agent..."
          />
          <div className="absolute right-3 bottom-2 flex items-center space-x-2">
            <ChatControl
              Icon={ArrowUp}
              type="submit"
              aria-label="Send message"
              disabled={
                (!input.trim() && pendingComments.length === 0) || inputIsLoading
              }
              isLoading={inputIsLoading}
            />
          </div>
        </div>
      </form>
    </div>
  );
};
