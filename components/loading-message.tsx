"use client";

import { motion } from "motion/react";
import type { ChatStatus, DataUIPart, UITool, UIToolInvocation } from "ai";
import { memo } from "react";
import type {
  ChatbotDataPart,
  ChatbotMessage,
} from "@/lib/features/chat/types";
import { DotsLoadingIcon } from "@/components/icons";

interface LoadingMessageProps {
  message: ChatbotMessage;
  status: ChatStatus;
  dataPart?: DataUIPart<Omit<ChatbotDataPart, "chat">> | undefined;
}

export const LoadingMessage: React.FC<LoadingMessageProps> = memo(
  ({ message, status, dataPart }) => {
    if (
      status === "ready" ||
      status === "error" ||
      (message.role === "assistant" && message.metadata?.status === "finished")
    ) {
      return null;
    }

    return (
      <motion.div
        className="flex items-center mt-4 ml-4 h-4"
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
                console.log("tool-rag", part);
                if (isToolLoading(part.state)) {
                  return (
                    <ToolLoading
                      key={`message-rag`}
                      text="Searching documents"
                    />
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

          if (
            dataPart?.type === "data-reasoning" &&
            dataPart.data.status === "started"
          ) {
            return <ToolLoading key={`message-reasoning`} text="Thinking" />;
          }

          return null;
        })()}
      </motion.div>
    );
  },
  (prevProps, nextProps) => {
    const nextToolPart = nextProps.message.parts.find(
      (part) => part.type === "tool-rag" || part.type === "tool-webSearch"
    );
    return (
      prevProps.status === nextProps.status &&
      prevProps.message.metadata?.status ===
        nextProps.message.metadata?.status &&
      !isToolLoading(nextToolPart?.state) &&
      prevProps.dataPart?.data.status === nextProps.dataPart?.data.status
    );
  }
);

LoadingMessage.displayName = "LoadingMessage";

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
