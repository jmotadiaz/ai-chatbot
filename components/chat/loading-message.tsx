"use client";

import { motion } from "motion/react";
import type { ChatStatus, UITool, UIToolInvocation } from "ai";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { DotsLoadingIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/helpers";

interface LoadingMessageProps {
  message: ChatbotMessage;
  status: ChatStatus;
  className?: string;
}

export const LoadingMessage: React.FC<LoadingMessageProps> = ({
  message,
  status,
  className,
}) => {
  if (
    status === "ready" ||
    status === "error" ||
    (message.role === "assistant" && message.metadata?.status === "finished")
  ) {
    return null;
  }

  return (
    <motion.div
      className={cn("flex items-center ml-4 h-4", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      data-testid="loading-message"
    >
      <div className="mr-4">
        <DotsLoadingIcon />
      </div>
      {(() => {
        for (const part of message.parts) {
          switch (part.type) {
            case "tool-rag":
              if (isToolLoading(part.state)) {
                return (
                  <ToolLoading key={`message-rag`} text="Searching documents" />
                );
              }
              break;
            case "tool-webSearch":
              if (isToolLoading(part.state)) {
                return (
                  <ToolLoading key={`message-web`} text="Searching the web" />
                );
              }
              break;
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
