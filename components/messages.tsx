import { Message } from "@/components/message";
import { ChatbotMessage } from "@/lib/ai/types";

export const Messages = ({ messages }: { messages: ChatbotMessage[] }) => {
  return (
    <>
      {messages.map((m, i) => (
        <Message key={i} message={m} />
      ))}
    </>
  );
};
