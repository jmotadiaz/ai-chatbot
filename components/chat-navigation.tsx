import { ChevronUp, ChevronDown, ChevronsDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useChatNavigation } from "@/lib/features/chat/hooks/use-chat-navigation";
import type { ChatbotMessage } from "@/lib/features/chat/types";

interface ChatNavigationProps {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  messages?: Array<ChatbotMessage>;
}

const buttonVariants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.8 },
};

const buttonTransition = {
  duration: 0.15,
  ease: "easeOut" as const,
};

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

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      {/* Fixed-width grid with 3 columns to keep buttons at stable x positions */}
      <div className="grid grid-cols-3 gap-2 w-[112px]">
        {/* Prev button slot - always at left */}
        <div className="flex justify-center items-center h-8 w-8">
          <AnimatePresence>
            {showPrev && (
              <motion.div
                key="prev"
                variants={buttonVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={buttonTransition}
                className="pointer-events-auto"
              >
                <Button
                  variant="secondary"
                  size="icon"
                  className="rounded-full shadow-md h-8 w-8 bg-background border border-border"
                  onClick={scrollToPrev}
                  aria-label="Previous message"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Next button slot - always at center */}
        <div className="flex justify-center items-center h-8 w-8">
          <AnimatePresence>
            {showNext && (
              <motion.div
                key="next"
                variants={buttonVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={buttonTransition}
                className="pointer-events-auto"
              >
                <Button
                  variant="secondary"
                  size="icon"
                  className="rounded-full shadow-md h-8 w-8 bg-background border border-border"
                  onClick={scrollToNext}
                  aria-label="Next message"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom button slot - always at right */}
        <div className="flex justify-center items-center h-8 w-8">
          <AnimatePresence>
            {showBottom && (
              <motion.div
                key="bottom"
                variants={buttonVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={buttonTransition}
                className="pointer-events-auto"
              >
                <Button
                  variant="secondary"
                  size="icon"
                  className="rounded-full shadow-md h-8 w-8 bg-background border border-border"
                  onClick={scrollToBottom}
                  aria-label="Scroll to bottom"
                >
                  <ChevronsDown className="h-4 w-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
