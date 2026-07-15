"use client";

import { useState } from "react";
import { ArrowUp } from "lucide-react";
import type { Message } from "@ag-ui/client";
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
  initialMessages: Message[];
  isInitiallyRunning: boolean;
}

export const AgentCodeChat: React.FC<AgentCodeChatProps> = ({
  project,
  sessionId,
  modelId,
  initialMessages,
  isInitiallyRunning,
}) => {
  const [input, setInput] = useState("");
  const { items, isRunning, sendMessage, status, error } = useCodingAgent({
    project,
    sessionId,
    modelId,
    initialMessages,
    isInitiallyRunning,
  });

  const { state: fileBrowserState, actions: fileBrowserActions } =
    useFileBrowser();
  const pendingComments = fileBrowserState.pendingComments;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = serializeComments(input, pendingComments);
    if (!message) return;
    await sendMessage(message);
    setInput("");
    fileBrowserActions.clearComments();
  };

  const isLoading = isRunning;

  return (
    <div
      data-testid="chat-container"
      className="flex flex-col relative h-full pt-16"
    >
      <AgentConversation items={items} isRunning={isRunning} status={status} />
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
            isLoading={isLoading}
            placeholder="Ask the coding agent..."
          />
          <div className="absolute right-3 bottom-2 flex items-center space-x-2">
            <ChatControl
              Icon={ArrowUp}
              type="submit"
              aria-label="Send message"
              disabled={
                (!input.trim() && pendingComments.length === 0) || isLoading
              }
              isLoading={isLoading}
            />
          </div>
        </div>
      </form>
    </div>
  );
};
