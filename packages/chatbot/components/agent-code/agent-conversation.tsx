"use client";

import * as React from "react";
import { useRef, useState, useEffect, useCallback } from "react";
import { AgentMessage } from "./agent-message";
import { ChatNavigation } from "@/components/chat/navigation";
import type { AgentStatus } from "@/lib/features/agent-code/hooks/use-coding-agent";
import { DotsLoadingIcon } from "@/components/ui/icons";
import type { AgentItem } from "@/lib/features/agent-code/types";

const SCROLL_NEAR_BOTTOM_THRESHOLD = 100;

function isNearBottom(container: HTMLElement) {
  return (
    container.scrollTop + container.clientHeight >=
    container.scrollHeight - SCROLL_NEAR_BOTTOM_THRESHOLD
  );
}

export interface AgentConversationProps {
  items: AgentItem[];
  isRunning: boolean;
  status: AgentStatus;
}

export const AgentConversation: React.FC<AgentConversationProps> = ({
  items,
  isRunning,
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
  }, [items, checkVisibility]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!userScrolledAway.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [items.length]);

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
      <div className="w-full h-full overflow-y-auto" ref={scrollContainerRef}>
        {items.length === 0 && !isRunning && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Ask the coding agent a question to get started.
          </div>
        )}
        <div className="max-w-5xl mx-auto px-8 pb-15">
          {items.map((item) => {
            if (item.kind === "assistant") {
              return (
                <AgentMessage
                  key={item.message.id}
                  message={item.message}
                  toolGroups={item.toolGroups}
                />
              );
            }
            return (
              <AgentMessage key={item.message.id} message={item.message} />
            );
          })}
          {isRunning && (
            <div
              data-testid="agent-status"
              className="flex items-center gap-2 text-muted-foreground text-sm py-3"
            >
              <DotsLoadingIcon />
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
