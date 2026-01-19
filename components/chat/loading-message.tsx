"use client";

import { motion } from "motion/react";
import type { ChatStatus, UITool, UIToolInvocation } from "ai";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { DotsLoadingIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/helpers";
import { destructuringMessageParts } from "@/lib/features/chat/utils";

interface LoadingMessageProps {
  message: ChatbotMessage;
  status: ChatStatus;
  className?: string;
}

const LOADING_MESSAGES: Record<string, string> = {
  "tool-rag": "Searching documents",
  "tool-webSearch": "Searching the web",
  "tool-urlContext": "Fetching URL content",
};

export const LoadingMessage: React.FC<LoadingMessageProps> = ({
  message,
  status,
  className,
}) => {
  if (
    status === "ready" ||
    status === "error" ||
    message.role !== "assistant" ||
    (message.role === "assistant" && message.metadata?.status === "finished")
  ) {
    return null;
  }

  const { toolParts } = destructuringMessageParts(message);

  return (
    <motion.div
      className={cn("flex items-center h-4", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      data-testid="loading-message"
    >
      <div className="mr-4">
        <DotsLoadingIcon />
      </div>
      {(() => {
        // Check all parts for any tool in loading state
        for (const part of toolParts) {
          if (isToolLoading(part.state)) {
            return (
              <ToolLoading
                key={`message-${part.type}`}
                text={LOADING_MESSAGES[part.type] || "Loading tool"}
              />
            );
          }
        }

        return null;
      })()}
    </motion.div>
  );
};

interface ToolLoadingProps {
  text: string;
}

const ToolLoading: React.FC<ToolLoadingProps> = ({ text }) => {
  return (
    <motion.div
      className="font-semibold text-zinc-500 dark:text-zinc-400"
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 20, opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      {text}
    </motion.div>
  );
};

const isToolLoading = (state?: UIToolInvocation<UITool>["state"]) => {
  return state === "input-available" || state === "input-streaming";
};
