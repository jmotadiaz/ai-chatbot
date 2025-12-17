import React, { useEffect, useState, useCallback } from "react";
import type { ChatbotMessage } from "@/lib/features/chat/types";

interface UseChatNavigationProps {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  messages?: Array<ChatbotMessage>;
}

export const useChatNavigation = ({
  scrollContainerRef,
  messages,
}: UseChatNavigationProps) => {
  const [showPrev, setShowPrev] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const getScrollPosition = useCallback((element: HTMLElement, container: HTMLElement) => {
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return elementRect.top - containerRect.top + container.scrollTop;
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const threshold = 50; // px
    const isAtBottom = scrollHeight - scrollTop - clientHeight < threshold;
    setShowBottom(!isAtBottom);

    const userMessages = Array.from(
      container.querySelectorAll('[data-role="user"]')
    ) as HTMLElement[];

    if (userMessages.length === 0) {
      setShowPrev(false);
      setShowNext(false);
      return;
    }

    // Tolerance
    const epsilon = 10;

    // A message is "prev" if its logical top is above current scroll position
    const hasPrev = userMessages.some((m) => {
      const top = getScrollPosition(m, container);
      return top < scrollTop - epsilon;
    });

    // A message is "next" if its logical top is below current scroll position
    const hasNext = userMessages.some((m) => {
      const top = getScrollPosition(m, container);
      return top > scrollTop + epsilon;
    });

    setShowPrev(hasPrev);
    setShowNext(hasNext);
  }, [scrollContainerRef, getScrollPosition]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll);
    // Initial check
    handleScroll();

    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, [scrollContainerRef, handleScroll, messages]);

  const scrollToPrev = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop } = container;
    const epsilon = 10;
    const userMessages = Array.from(
      container.querySelectorAll('[data-role="user"]')
    ) as HTMLElement[];

    // Find closest message above
    const target = userMessages
      .map((m) => ({ el: m, top: getScrollPosition(m, container) }))
      .filter((item) => item.top < scrollTop - epsilon)
      .sort((a, b) => b.top - a.top)[0];

    if (target) {
      container.scrollTo({ top: target.top, behavior: "smooth" });
    }
  };

  const scrollToNext = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop } = container;
    const epsilon = 10;
    const userMessages = Array.from(
      container.querySelectorAll('[data-role="user"]')
    ) as HTMLElement[];

    // Find closest message below
    const target = userMessages
      .map((m) => ({ el: m, top: getScrollPosition(m, container) }))
      .filter((item) => item.top > scrollTop + epsilon)
      .sort((a, b) => a.top - b.top)[0];

    if (target) {
      container.scrollTo({ top: target.top, behavior: "smooth" });
    }
  };

  const scrollToBottom = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  return {
    showPrev,
    showNext,
    showBottom,
    scrollToPrev,
    scrollToNext,
    scrollToBottom,
  };
};
