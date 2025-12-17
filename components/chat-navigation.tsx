import { ChevronUp, ChevronDown, ChevronsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatNavigation } from "@/lib/features/chat/navigation/use-chat-navigation";
import type { Message } from "ai";

interface ChatNavigationProps {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  messages?: Array<Message>;
}

export const ChatNavigation: React.FC<ChatNavigationProps> = ({
  scrollContainerRef,
  messages,
}) => {
  const {
    showPrev,
    showNext,
    showBottom,
    scrollToPrev,
    scrollToNext,
    scrollToBottom,
  } = useChatNavigation({ scrollContainerRef, messages });

  if (!showPrev && !showNext && !showBottom) return null;

  return (
    <div
      className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-row gap-2 z-20"
    >
      {showPrev && (
        <Button
          variant="secondary"
          size="icon"
          className="rounded-full shadow-md h-8 w-8 bg-background border border-border"
          onClick={scrollToPrev}
          aria-label="Previous message"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      )}
      {showNext && (
        <Button
          variant="secondary"
          size="icon"
          className="rounded-full shadow-md h-8 w-8 bg-background border border-border"
          onClick={scrollToNext}
          aria-label="Next message"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      )}
      {showBottom && (
        <Button
          variant="secondary"
          size="icon"
          className="rounded-full shadow-md h-8 w-8 bg-background border border-border"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          <ChevronsDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};
