import { useEffect, useState, useCallback, useRef } from "react";
import type { ChatbotMessage } from "@/lib/features/chat/types";

interface UseChatNavigationProps {
  messages?: Array<ChatbotMessage>;
}

/**
 * Wrapper for Element.scrollTo that respects prefers-reduced-motion accessibility setting.
 * When the user has reduced motion enabled, scroll behavior becomes 'instant'.
 */
const scrollTo = (element: HTMLElement, options: ScrollToOptions): void => {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  element.scrollTo({
    ...options,
    behavior: prefersReducedMotion ? "instant" : options.behavior ?? "smooth",
  });
};

const getScrollPosition = (
  element: HTMLElement,
  container: HTMLElement,
  offset = 0
) => {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return elementRect.top - containerRect.top + container.scrollTop - offset;
};

const getLastUserMessageElement = (container: HTMLElement) => {
  const userMessageElements = Array.from(
    container.querySelectorAll('[data-role="user"]')
  ) as HTMLElement[];
  return userMessageElements[userMessageElements.length - 1] ?? null;
};

export const useChatNavigation = ({
  messages = [],
}: UseChatNavigationProps) => {
  const [showPrev, setShowPrev] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showBottom, setShowBottom] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const hasInitialScrolled = useRef(false);
  const prevUserMessageCount = useRef(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const bottomObserverRef = useRef<IntersectionObserver | null>(null);

  // Internal refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);

  // During initial navigation, Streamdown/code-block rendering can change heights after
  // we already scrolled to the last user message. This lock keeps the last user message
  // aligned until layout stabilizes (or the user interacts).
  const initialAnchorActiveRef = useRef(false);
  const initialAnchorResizeObserverRef = useRef<ResizeObserver | null>(null);
  const initialAnchorStopTimerRef = useRef<number | null>(null);
  const initialAnchorContainerRef = useRef<HTMLElement | null>(null);

  // Filter user messages from the messages prop
  const userMessages = messages.filter((m) => m.role === "user");
  const userMessageCount = userMessages.length;

  const stopInitialAnchorLock = useCallback(() => {
    initialAnchorActiveRef.current = false;

    if (initialAnchorStopTimerRef.current) {
      window.clearTimeout(initialAnchorStopTimerRef.current);
      initialAnchorStopTimerRef.current = null;
    }

    if (initialAnchorResizeObserverRef.current) {
      initialAnchorResizeObserverRef.current.disconnect();
      initialAnchorResizeObserverRef.current = null;
    }

    const container = initialAnchorContainerRef.current;
    if (container) {
      container.removeEventListener("wheel", stopInitialAnchorLock);
      container.removeEventListener("touchstart", stopInitialAnchorLock);
      container.removeEventListener("pointerdown", stopInitialAnchorLock);
      container.removeEventListener("keydown", stopInitialAnchorLock);
    }
    initialAnchorContainerRef.current = null;
  }, []);

  const scrollToLastUserMessage = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const container = scrollContainerRef.current;
      if (!container) return;

      requestAnimationFrame(() => {
        const lastUserMessageEl = getLastUserMessageElement(container);
        if (lastUserMessageEl) {
          const top = getScrollPosition(lastUserMessageEl, container);
          scrollTo(container, { top, behavior });
        }
      });
    },
    [scrollContainerRef]
  );

  const startInitialAnchorLock = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    stopInitialAnchorLock();
    initialAnchorActiveRef.current = true;
    initialAnchorContainerRef.current = container;

    // Stop if the user interacts (we should not fight manual scroll).
    container.addEventListener("wheel", stopInitialAnchorLock, {
      passive: true,
    });
    container.addEventListener("touchstart", stopInitialAnchorLock, {
      passive: true,
    });
    container.addEventListener("pointerdown", stopInitialAnchorLock, {
      passive: true,
    });
    // keyboard navigation (page up/down, arrows, space, etc.)
    container.addEventListener("keydown", stopInitialAnchorLock);

    // Prefer observing the inner content container to reduce noise.
    const contentContainer =
      (container.querySelector(".max-w-5xl") as HTMLElement | null) ??
      container;

    const scheduleStop = () => {
      if (initialAnchorStopTimerRef.current) {
        window.clearTimeout(initialAnchorStopTimerRef.current);
      }
      // If layout stays stable for a bit, release the lock.
      initialAnchorStopTimerRef.current = window.setTimeout(() => {
        stopInitialAnchorLock();
      }, 300);
    };

    if (typeof ResizeObserver === "undefined") {
      // Fallback: release quickly if ResizeObserver isn't available.
      scheduleStop();
      return;
    }

    const ro = new ResizeObserver(() => {
      if (!initialAnchorActiveRef.current) return;
      // Keep aligning to the last user message while layout is changing.
      scrollToLastUserMessage("instant");
      scheduleStop();
    });
    initialAnchorResizeObserverRef.current = ro;
    ro.observe(contentContainer);

    // Kick the timer so we don't lock indefinitely if nothing resizes.
    scheduleStop();
  }, [scrollContainerRef, scrollToLastUserMessage, stopInitialAnchorLock]);

  // Initial scroll to last user message when loading existing chat
  useEffect(() => {
    if (hasInitialScrolled.current || userMessageCount === 0) return;

    scrollToLastUserMessage("instant");
    // Keep the last user message anchored while late-rendering content settles.
    // Run on the next frame to ensure the initial scroll has happened.
    requestAnimationFrame(() => startInitialAnchorLock());
    hasInitialScrolled.current = true;
    prevUserMessageCount.current = userMessageCount;
  }, [userMessageCount, scrollToLastUserMessage, startInitialAnchorLock]);

  // Scroll to last user message when a new user message is added
  useEffect(() => {
    if (!hasInitialScrolled.current) return;

    if (userMessageCount > prevUserMessageCount.current) {
      scrollToLastUserMessage("smooth");
    }
    prevUserMessageCount.current = userMessageCount;
  }, [userMessageCount, scrollToLastUserMessage]);

  useEffect(() => {
    return () => {
      stopInitialAnchorLock();
    };
  }, [stopInitialAnchorLock]);

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
            // Show prev when first user message is NOT visible AND there's more than 1 user message
            setShowPrev(
              !entry.isIntersecting && userMessageElements.length > 1
            );
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

    const bottomObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === bottomSentinelRef.current) {
            // Show bottom button when sentinel is NOT visible
            setShowBottom(!entry.isIntersecting);
          } else if (entry.target === topSentinelRef.current) {
            // Show top button when top sentinel is NOT visible
            setShowTop(!entry.isIntersecting);
          }
        });
      },
      {
        root: container,
        threshold: 0,
        rootMargin: "50px 0px 50px 0px", // 50px buffer before top/bottom
      }
    );

    bottomObserverRef.current = bottomObserver;

    if (bottomSentinelRef.current) {
      bottomObserver.observe(bottomSentinelRef.current);
    }

    if (topSentinelRef.current) {
      bottomObserver.observe(topSentinelRef.current);
    } else {
      setShowTop(false);
    }

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
      scrollTo(container, { top: target.top, behavior: "smooth" });
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
    // Use 50px threshold to account for container padding and avoid selecting
    // the currently visible message at the top
    const target = userMessageElements
      .map((m) => ({ el: m, top: getScrollPosition(m, container) }))
      .filter((item) => item.top > scrollTop + 50)
      .sort((a, b) => a.top - b.top)[0];

    if (target) {
      scrollTo(container, { top: target.top, behavior: "smooth" });
    }
  }, [scrollContainerRef]);

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      scrollTo(container, {
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [scrollContainerRef]);

  const scrollToTop = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      scrollTo(container, {
        top: 0,
        behavior: "smooth",
      });
    }
  }, [scrollContainerRef]);

  return {
    showPrev,
    showNext,
    showBottom,
    showTop,
    scrollToPrev,
    scrollToNext,
    scrollToBottom,
    scrollToTop,
    scrollToLastUserMessage,
    scrollContainerRef,
    topSentinelRef,
    bottomSentinelRef,
  };
};
