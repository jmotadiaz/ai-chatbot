import { Message } from "@/components/message";
import { ChatbotMessage } from "@/lib/ai/types";

export const Messages = ({
  messages,
  isLoading,
  status,
}: {
  messages: ChatbotMessage[];
  isLoading: boolean;
  status: "error" | "submitted" | "streaming" | "ready";
}) => {
  return (
    <>
      {messages.map((m, i) => (
        <Message
          key={i}
          isLatestMessage={i === messages.length - 1}
          isLoading={isLoading}
          message={m}
          status={status}
        />
      ))}
    </>
  );
};
