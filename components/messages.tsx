import { Message } from "@/components/message";
import { ChatbotMessage } from "@/lib/ai/types";

export const Messages = ({
  messages,
  isLoading,
}: {
  messages: ChatbotMessage[];
  isLoading: boolean;
}) => {
  console.log(messages.at(-1)?.parts.map((p) => p.type));
  console.log(messages.at(-1)?.metadata);
  return (
    <>
      {messages.map((m, i) => (
        <Message
          key={i}
          isLatestMessage={i === messages.length - 1}
          isLoading={isLoading}
          message={m}
        />
      ))}
    </>
  );
};
