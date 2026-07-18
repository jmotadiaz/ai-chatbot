import { ChevronUp, ChevronDown, ChevronsDown, ChevronsUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/helpers";

interface ChatNavigationProps {
  showPrev: boolean;
  showNext: boolean;
  showBottom: boolean;
  showTop: boolean;
  scrollToPrev: () => void;
  scrollToNext: () => void;
  scrollToBottom: () => void;
  scrollToTop: () => void;
  className?: string;
}

const buttonVariants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.8 },
};

const buttonTransition = {
  duration: 0.25,
  ease: "easeInOut" as const,
};

const ChatNavigationButton: React.FC<{
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}> = ({ onClick, ariaLabel, children }) => (
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
      className="rounded-full shadow-md h-8 w-8 bg-secondary border border-border opacity-90"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </Button>
  </motion.div>
);

export const ChatNavigation: React.FC<ChatNavigationProps> = ({
  showPrev,
  showNext,
  showBottom,
  showTop,
  scrollToPrev,
  scrollToNext,
  scrollToBottom,
  scrollToTop,
  className,
}) => {
  return (
    <AnimatePresence>
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none",
          className
        )}
        data-testid="chat-navigation-wrapper"
      >
        <div className="grid grid-cols-4 gap-2 w-[152px]">
          <div className="flex justify-center items-center w-8">
            {showTop && (
              <ChatNavigationButton
                onClick={scrollToTop}
                ariaLabel="Scroll to top"
              >
                <ChevronsUp className="h-4 w-4" />
              </ChatNavigationButton>
            )}
          </div>

          <div className="flex justify-center items-center w-8">
            {showPrev && (
              <ChatNavigationButton
                onClick={scrollToPrev}
                ariaLabel="Previous message"
              >
                <ChevronUp className="h-4 w-4" />
              </ChatNavigationButton>
            )}
          </div>

          <div className="flex justify-center items-center w-8">
            {showNext && (
              <ChatNavigationButton
                onClick={scrollToNext}
                ariaLabel="Next message"
              >
                <ChevronDown className="h-4 w-4" />
              </ChatNavigationButton>
            )}
          </div>

          <div className="flex justify-center items-center w-8">
            {showBottom && (
              <ChatNavigationButton
                onClick={scrollToBottom}
                ariaLabel="Scroll to bottom"
              >
                <ChevronsDown className="h-4 w-4" />
              </ChatNavigationButton>
            )}
          </div>
        </div>
      </div>
    </AnimatePresence>
  );
};
