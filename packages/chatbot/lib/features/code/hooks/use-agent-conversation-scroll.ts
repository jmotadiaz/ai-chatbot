"use client";

import { useRef, useState, useEffect, useCallback } from "react";

const SCROLL_NEAR_BOTTOM_THRESHOLD = 100;

function isNearBottom(container: HTMLElement) {
  return (
    container.scrollTop + container.clientHeight >=
    container.scrollHeight - SCROLL_NEAR_BOTTOM_THRESHOLD
  );
}

export interface UseAgentConversationScrollArgs {
  items: unknown[];
}

export interface UseAgentConversationScrollResult {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  showTop: boolean;
  showBottom: boolean;
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

export function useAgentConversationScroll({
  items,
}: UseAgentConversationScrollArgs): UseAgentConversationScrollResult {
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
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [handleScroll, checkVisibility]);

  // Depend on the item count, not the array identity: `items` is rebuilt on
  // every streamed chunk, and checkVisibility reads scrollHeight/clientHeight,
  // which forces a synchronous reflow over the whole conversation DOM. Keying
  // on length matches the auto-scroll effect below; the rAF-guarded scroll
  // listener covers everything else.
  useEffect(() => {
    checkVisibility();
  }, [items.length, checkVisibility]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!userScrolledAway.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [items.length]);

  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  return {
    scrollContainerRef,
    showTop,
    showBottom,
    scrollToTop,
    scrollToBottom,
  };
}
