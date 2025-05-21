import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { ArrowDown } from "lucide-react";

interface ScrollToBottomButtonProps {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  observeRef: React.RefObject<HTMLElement | null>;
}

export const ScrollToBottomButton = ({
  scrollContainerRef,
  observeRef,
}: ScrollToBottomButtonProps) => {
  const [showButton, setShowButton] = useState(false);
  const observedElement = observeRef.current;

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowButton(!entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    if (observedElement) {
      observer.observe(observedElement);
    }

    return () => {
      if (observedElement) {
        observer.unobserve(observedElement);
      }
    };
  }, [observedElement]);

  return (
    <div
      className={`absolute bottom-4 left-1/2 transform -translate-x-1/2 transition-opacity duration-300 ${
        showButton ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
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
