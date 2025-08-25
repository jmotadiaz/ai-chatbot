import { AnimatePresence, motion } from "motion/react";
import { ChatStatus } from "ai";
import { ChatbotMessage } from "@/lib/ai/types";
import { DotsLoadingIcon } from "@/components/icons";

interface LoadingMessageProps {
  message: ChatbotMessage;
  status: ChatStatus;
}

export const LoadingMessage: React.FC<LoadingMessageProps> = ({
  message,
  status,
}) => {
  const toolParts = message.parts?.filter(
    (part) =>
      part.type === "data-web-search" ||
      part.type === "data-rag" ||
      part.type === "data-reasoning"
  );

  if (
    status === "ready" ||
    status === "error" ||
    message?.metadata?.status === "streaming" ||
    message?.metadata?.status === "finished"
  ) {
    return null;
  }

  return (
    <div className="flex items-center mt-4 ml-4 h-4">
      <AnimatePresence>
        <div className="mr-4">
          <DotsLoadingIcon />
        </div>
        {toolParts.map((part, i) => {
          switch (part.type) {
            case "data-web-search":
              if (part.data.status === "loading") {
                return (
                  <ToolLoading
                    key={`message-web-${message.id}-${i}`}
                    text="Searching the web"
                  />
                );
              }
              return null;
            case "data-rag":
              if (part.data.status === "loading") {
                return (
                  <ToolLoading
                    key={`message-rag-${message.id}-${i}`}
                    text="Searching documents"
                  />
                );
              }
              return null;
            case "data-reasoning":
              if (part.data.status === "started") {
                return (
                  <ToolLoading
                    key={`message-reasoning-${message.id}-${i}`}
                    text="Reasoning"
                  />
                );
              }
              return null;
            default:
              return null;
          }
        })}
      </AnimatePresence>
    </div>
  );
};

interface ToolLoadingProps {
  text: string;
}

const ToolLoading: React.FC<ToolLoadingProps> = ({ text }) => {
  return (
    <motion.div
      className="font-medium"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 5, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
      {text}
    </motion.div>
  );
};
