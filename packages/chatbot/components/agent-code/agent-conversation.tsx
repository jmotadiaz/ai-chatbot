"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils/helpers";
import { AgentMessage } from "./agent-message";
import { ChatNavigation } from "@/components/chat/navigation";

export interface AgentConversationProps {
  messages: Array<{ role: string; content: string }>;
  isRunning: boolean;
}

export const AgentConversation: React.FC<AgentConversationProps> = ({
  messages,
  isRunning,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const checkVisibility = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    setShowTop(container.scrollTop > 100);
    setShowBottom(
      container.scrollTop + container.clientHeight <
        container.scrollHeight - 100,
    );
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", checkVisibility);
    checkVisibility();
    return () => container.removeEventListener("scroll", checkVisibility);
  }, [checkVisibility]);

  useEffect(() => {
    checkVisibility();
  }, [messages, checkVisibility]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages.length]);

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToBottom = () => {
    scrollContainerRef.current?.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  return (
    <div className="w-full relative overflow-y-hidden flex-1">
      <div
        className="w-full h-full overflow-y-auto"
        ref={scrollContainerRef}
      >
        {messages.length === 0 && !isRunning && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Ask the coding agent a question to get started.
          </div>
        )}
        <div ref={topSentinelRef} className="h-[1px] w-full" />
        <div className="min-h-[calc(100%-2px)] max-w-5xl mx-auto px-8 pb-15">
          {messages.map((msg, idx) => (
            <AgentMessage
              key={idx}
              role={msg.role as "user" | "assistant"}
              content={msg.content}
            />
          ))}
          {isRunning && (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <div className="animate-spin h-5 w-5 rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm">Running...</span>
            </div>
          )}
        </div>
        <div ref={bottomSentinelRef} className="h-[1px] w-full" />
      </div>
      <ChatNavigation
        showPrev={false}
        showNext={false}
        showBottom={showBottom}
        showTop={showTop}
        scrollToPrev={() => {}}
        scrollToNext={() => {}}
        scrollToBottom={scrollToBottom}
        scrollToTop={scrollToTop}
        className="bottom-4"
      />
    </div>
  );
};
