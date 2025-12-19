import React, { useEffect, useState, useCallback, useRef } from "react";
import type { ChatbotMessage } from "@/lib/features/chat/types";

interface UseChatNavigationProps {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  messages?: Array<ChatbotMessage>;
}

const getScrollPosition = (element: HTMLElement, container: HTMLElement) => {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return elementRect.top - containerRect.top + container.scrollTop;
};



export const useChatNavigation = ({
  scrollContainerRef,
  messages = [],
}: UseChatNavigationProps) => {
  const [showPrev, setShowPrev] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showBottom, setShowBottom] = useState(false);
  const hasInitialScrolled = useRef(false);
  const prevUserMessageCount = useRef(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const bottomObserverRef = useRef<IntersectionObserver | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);

  // Filter user messages from the messages prop
  const userMessages = messages.filter((m) => m.role === "user");
  const userMessageCount = userMessages.length;

  const scrollToLastUserMessage = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const container = scrollContainerRef.current;
      if (!container) return;

      requestAnimationFrame(() => {
        const userMessageElements = Array.from(
          container.querySelectorAll('[data-role="user"]')
        ) as HTMLElement[];

        const lastUserMessageEl =
          userMessageElements[userMessageElements.length - 1];
        if (lastUserMessageEl) {
          const top = getScrollPosition(lastUserMessageEl, container);
          container.scrollTo({ top, behavior });
        }
      });
    },
    [scrollContainerRef]
  );

  // Initial scroll to last user message when loading existing chat
  useEffect(() => {
    if (hasInitialScrolled.current || userMessageCount === 0) return;

    scrollToLastUserMessage("instant");
    hasInitialScrolled.current = true;
    prevUserMessageCount.current = userMessageCount;
  }, [userMessageCount, scrollToLastUserMessage]);

  // Scroll to last user message when a new user message is added
  useEffect(() => {
    if (!hasInitialScrolled.current) return;

    if (userMessageCount > prevUserMessageCount.current) {
      scrollToLastUserMessage("smooth");
    }
    prevUserMessageCount.current = userMessageCount;
  }, [userMessageCount, scrollToLastUserMessage]);

  // Setup IntersectionObserver for first and last user messages
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const userMessageElements = Array.from(
      container.querySelectorAll('[data-role="user"]')
    ) as HTMLElement[];

    if (userMessageElements.length === 0) {
      setShowPrev(false);
      setShowNext(false);
      return;
    }

    const firstUserMessageEl = userMessageElements[0];
    const lastUserMessageEl =
      userMessageElements[userMessageElements.length - 1];

    const observer = new IntersectionObserver(
      (entries) => {
        const containerRect = container.getBoundingClientRect();

        entries.forEach((entry) => {
          if (entry.target === firstUserMessageEl) {
            // Show prev when first user message is NOT visible (completely left viewport)
            setShowPrev(!entry.isIntersecting);
          }
          if (entry.target === lastUserMessageEl) {
            // Only show next when last message is BELOW the viewport (not when it's above)
            // Check if the element's top is below the container's bottom
            const elementRect = entry.target.getBoundingClientRect();
            const isBelowViewport = elementRect.top > containerRect.bottom;

            // Show next when last user message is below viewport AND there's more than 1 user message
            setShowNext(
              !entry.isIntersecting &&
              isBelowViewport &&
              userMessageElements.length > 1
            );
          }
        });
      },
      {
        root: container,
        threshold: 0, // Trigger when element completely leaves/enters viewport
      }
    );

    observerRef.current = observer;

    observer.observe(firstUserMessageEl);
    if (lastUserMessageEl !== firstUserMessageEl) {
      observer.observe(lastUserMessageEl);
    }

    return () => {
      observer.disconnect();
    };
  }, [scrollContainerRef, messages]);

  // Setup IntersectionObserver for bottom sentinel (show/hide scroll to bottom button)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Clean up previous observer
    if (bottomObserverRef.current) {
      bottomObserverRef.current.disconnect();
    }

    // Create or reuse bottom sentinel element
    let sentinel = bottomSentinelRef.current;
    if (!sentinel) {
      sentinel = document.createElement("div");
      sentinel.style.height = "1px";
      sentinel.style.width = "100%";
      sentinel.setAttribute("data-bottom-sentinel", "true");
      bottomSentinelRef.current = sentinel;
    }

    // Find the inner content container and append sentinel
    const contentContainer = container.querySelector(".max-w-5xl");
    if (contentContainer && !contentContainer.contains(sentinel)) {
      contentContainer.appendChild(sentinel);
    }

    const bottomObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Show bottom button when sentinel is NOT visible
          setShowBottom(!entry.isIntersecting);
        });
      },
      {
        root: container,
        threshold: 0,
        rootMargin: "0px 0px 50px 0px", // 50px buffer before bottom
      }
    );

    bottomObserverRef.current = bottomObserver;
    bottomObserver.observe(sentinel);

    return () => {
      bottomObserver.disconnect();
    };
  }, [scrollContainerRef, messages]);

  const scrollToPrev = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop } = container;
    const userMessageElements = Array.from(
      container.querySelectorAll('[data-role="user"]')
    ) as HTMLElement[];

    // Find closest message above current scroll position
    const target = userMessageElements
      .map((m) => ({ el: m, top: getScrollPosition(m, container) }))
      .filter((item) => item.top < scrollTop - 10)
      .sort((a, b) => b.top - a.top)[0];

    if (target) {
      container.scrollTo({ top: target.top, behavior: "smooth" });
    }
  }, [scrollContainerRef]);

  const scrollToNext = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop } = container;
    const userMessageElements = Array.from(
      container.querySelectorAll('[data-role="user"]')
    ) as HTMLElement[];

    // Find closest message below current scroll position
    const target = userMessageElements
      .map((m) => ({ el: m, top: getScrollPosition(m, container) }))
      .filter((item) => item.top > scrollTop + 10)
      .sort((a, b) => a.top - b.top)[0];

    if (target) {
      container.scrollTo({ top: target.top, behavior: "smooth" });
    }
  }, [scrollContainerRef]);

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [scrollContainerRef]);

  return {
    showPrev,
    showNext,
    showBottom,
    scrollToPrev,
    scrollToNext,
    scrollToBottom,
  };
};
