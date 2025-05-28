import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { ArrowDown } from "lucide-react";
import { cn } from "../lib/utils";

interface ScrollToBottomButtonProps {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  observeRef: React.RefObject<HTMLDivElement | null>;
}

export const ScrollToBottomButton = ({
  scrollContainerRef,
  observeRef,
}: ScrollToBottomButtonProps) => {
  const [showButton, setShowButton] = useState(false);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    const observedElement = observeRef.current;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowButton(!entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    if (observedElement) {
      setShowButton(!inViewport(observedElement));
      observer.observe(observedElement);
    }

    return () => {
      if (observedElement) {
        observer.unobserve(observedElement);
      }
    };
  }, [observeRef]);

  return (
    <div
      className={cn(
        "absolute bottom-4 left-1/2 transform -translate-x-1/2 transition-opacity duration-300",
        showButton ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      <Button
        variant="secondary"
        size="icon"
        className="rounded-full shadow-md h-10 w-10"
        onClick={scrollToBottom}
        aria-label="Scroll to bottom"
      >
        <ArrowDown className="h-5 w-5" />
      </Button>
    </div>
  );
};

function inViewport(element: HTMLElement): boolean {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}
