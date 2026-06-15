"use client";

import { useState } from "react";
import { ExecutionIndicator } from "./execution-indicator";
import { useCodingAgent } from "@/lib/features/agent-code/hooks/use-coding-agent";
import { ModelPickerSelector } from "@/components/chat/model-picker";
import type { chatModelId } from "@/lib/features/foundation-model/config";

export interface AgentCodeChatProps {
  project: string;
  sessionId: string;
  availableModels: string[];
}

export const AgentCodeChat: React.FC<AgentCodeChatProps> = ({
  project,
  sessionId,
  availableModels,
}) => {
  const [modelId, setModelId] = useState<string>(availableModels[0]);
  const [input, setInput] = useState("");
  const { messages, isRunning, sendMessage } = useCodingAgent({
    project,
    sessionId,
    modelId,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await sendMessage(input);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full" data-testid="chat-container">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <strong>{project}</strong> / {sessionId}
        </div>
        <ModelPickerSelector
          id="coding-agent-model"
          selectedModel={modelId as chatModelId}
          setSelectedModel={setModelId as (m: chatModelId) => void}
          models={availableModels as chatModelId[]}
        />
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg ${
              msg.role === "user"
                ? "bg-muted ml-auto max-w-[80%]"
                : "bg-accent max-w-[80%]"
            }`}
          >
            {msg.content}
          </div>
        ))}
        {isRunning && <ExecutionIndicator />}
      </div>
      <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-md"
          placeholder="Ask the agent..."
        />
        <button
          type="submit"
          disabled={isRunning}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
        >
          Send
        </button>
      </form>
    </div>
  );
};
