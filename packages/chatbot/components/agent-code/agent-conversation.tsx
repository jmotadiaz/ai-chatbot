"use client";

import * as React from "react";
import { useRef, useState, useEffect, useCallback } from "react";
import type { Message } from "@ag-ui/client";
import { AgentMessage } from "./agent-message";
import { ChatNavigation } from "@/components/chat/navigation";
import type { AgentStatus } from "@/lib/features/agent-code/hooks/use-coding-agent";
import { DotsLoadingIcon } from "@/components/ui/icons";

const SCROLL_NEAR_BOTTOM_THRESHOLD = 100;

function isNearBottom(container: HTMLElement) {
  return (
    container.scrollTop + container.clientHeight >=
    container.scrollHeight - SCROLL_NEAR_BOTTOM_THRESHOLD
  );
}

function statusLabel(status: AgentStatus): string {
  switch (status.kind) {
    case "idle":
      return "";
    case "thinking":
      return "Reasoning...";
    case "writing":
      return "Writing response...";
    case "tool_calling":
      return `Calling: ${status.toolName}...`;
    case "step_running":
      return "";
  }
}

export interface AgentConversationProps {
  messages: Message[];
  isRunning: boolean;
  status: AgentStatus;
}

export const AgentConversation: React.FC<AgentConversationProps> = ({
  messages,
  isRunning,
  status,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledAway = useRef(false);
  const rafId = useRef(0);
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const checkVisibility = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    setShowTop(container.scrollTop > 100);
    setShowBottom(!isNearBottom(container));
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    userScrolledAway.current = !isNearBottom(container);
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(() => {
        rafId.current = 0;
        checkVisibility();
      });
    }
  }, [checkVisibility]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleScroll);
    checkVisibility();
    return () => {
      container.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(rafId.current);
    };
  }, [handleScroll, checkVisibility]);

  useEffect(() => {
    checkVisibility();
  }, [messages, checkVisibility]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!userScrolledAway.current) {
      container.scrollTop = container.scrollHeight;
    }
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

  const label = statusLabel(status);

  return (
    <div className="w-full relative overflow-y-hidden flex-1">
      <div className="w-full h-full overflow-y-auto" ref={scrollContainerRef}>
        {messages.length === 0 && !isRunning && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Ask the coding agent a question to get started.
          </div>
        )}
        <div className="max-w-5xl mx-auto px-8 pb-15">
          {messages.map((msg: Message) => (
            <AgentMessage key={msg.id} message={msg} />
          ))}
          {isRunning && label && (
            <div
              data-testid="agent-status"
              className="flex items-center gap-2 text-muted-foreground text-sm py-3"
            >
              <DotsLoadingIcon />
              <span>{label}</span>
            </div>
          )}
        </div>
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
