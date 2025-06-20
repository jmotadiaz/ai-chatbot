import type { Message as TMessage } from "ai";
import { Message } from "@/components/message";

export const Messages = ({
  messages,
  isLoading,
  status,
}: {
  messages: TMessage[];
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
