"use client";

import { useRef, useState, useEffect, useCallback } from "react";

const SCROLL_NEAR_BOTTOM_THRESHOLD = 100;

function isNearBottom(container: HTMLElement) {
  return (
    container.scrollTop + container.clientHeight >=
    container.scrollHeight - SCROLL_NEAR_BOTTOM_THRESHOLD
  );
}

/**
 * Wrapper for Element.scrollTo that respects prefers-reduced-motion accessibility setting.
 */
const scrollTo = (element: HTMLElement, options: ScrollToOptions): void => {
  const prefersReducedMotion =
    typeof window.matchMedia !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

export interface UseAgentConversationScrollArgs {
  items: unknown[];
}

export interface UseAgentConversationScrollResult {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  showTop: boolean;
  showBottom: boolean;
  showPrev: boolean;
  showNext: boolean;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  scrollToPrev: () => void;
  scrollToNext: () => void;
}

export function useAgentConversationScroll({
  items,
}: UseAgentConversationScrollArgs): UseAgentConversationScrollResult {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledAway = useRef(false);
  const rafId = useRef(0);
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);
  const [showPrev, setShowPrev] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

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

  // Setup IntersectionObserver for first and last user messages (prev/next navigation)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (typeof IntersectionObserver === "undefined") return;

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
            const elementRect = entry.target.getBoundingClientRect();
            const isBelowViewport = elementRect.top > containerRect.bottom;

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
        threshold: 0,
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
  }, [items.length]);

  const scrollToTop = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      scrollTo(container, { top: 0, behavior: "smooth" });
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      scrollTo(container, {
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

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
  }, []);

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
  }, []);

  return {
    scrollContainerRef,
    showTop,
    showBottom,
    showPrev,
    showNext,
    scrollToTop,
    scrollToBottom,
    scrollToPrev,
    scrollToNext,
  };
}
