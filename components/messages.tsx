import type { Message as TMessage } from "ai";
import { Message } from "./message";
import { useRef } from "react";
import { ScrollToBottomButton } from "./scroll-to-bottom-btn";

export const Messages = ({
  messages,
  isLoading,
  status,
}: {
  messages: TMessage[];
  isLoading: boolean;
  status: "error" | "submitted" | "streaming" | "ready";
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastComponentRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div className="" ref={scrollContainerRef}>
        <div className="pt-8">
          {messages.map((m, i) => (
            <Message
              key={i}
              isLatestMessage={i === messages.length - 1}
              isLoading={isLoading}
              message={m}
              status={status}
            />
          ))}
          <div className="h-1 last-component" ref={lastComponentRef} />
        </div>
      </div>

      <ScrollToBottomButton
        scrollContainerRef={scrollContainerRef}
        observeRef={lastComponentRef}
      />
    </>
  );
};
