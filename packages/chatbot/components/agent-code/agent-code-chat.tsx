"use client";

import { useState } from "react";
import { ArrowUp } from "lucide-react";
import type { Message } from "@ag-ui/client";
import { AgentConversation } from "./agent-conversation";
import { Textarea } from "@/components/chat/textarea";
import { ChatControl } from "@/components/chat/control";
import { useCodingAgent } from "@/lib/features/agent-code/hooks/use-coding-agent";

export interface AgentCodeChatProps {
  project: string;
  sessionId: string;
  modelId: string;
  initialMessages: Message[];
}

export const AgentCodeChat: React.FC<AgentCodeChatProps> = ({
  project,
  sessionId,
  modelId,
  initialMessages,
}) => {
  const [input, setInput] = useState("");
  const { items, isRunning, sendMessage, status, error } = useCodingAgent({
    project,
    sessionId,
    modelId,
    initialMessages,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await sendMessage(input);
    setInput("");
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
              disabled={!input.trim() || isLoading}
              isLoading={isLoading}
            />
          </div>
        </div>
      </form>
    </div>
  );
};
