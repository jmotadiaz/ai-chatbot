import type { ReasoningUIPart } from "ai";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SpinnerIcon } from "@/components/icons";
import { Response } from "@/components/response";

interface ReasoningProps {
  part: ReasoningUIPart;
  isReasoningDone: boolean;
  className?: string;
}

export const Reasoning: React.FC<ReasoningProps> = ({
  part,
  isReasoningDone,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const variants = {
    collapsed: {
      height: 0,
      opacity: 0,
      marginTop: 0,
      marginBottom: 0,
    },
    expanded: {
      height: "auto",
      opacity: 1,
      marginTop: "1rem",
      marginBottom: 0,
    },
  };

  const memoizedSetIsExpanded = useCallback((value: boolean) => {
    setIsExpanded(value);
  }, []);

  useEffect(() => {
    memoizedSetIsExpanded(!isReasoningDone);
  }, [isReasoningDone, memoizedSetIsExpanded]);

  if (!part.text) {
    return null;
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {!isReasoningDone ? (
        <div className="flex flex-row gap-2 items-center">
          <div className="font-semibold text-sm">Reasoning</div>
          <div className="animate-spin">
            <SpinnerIcon />
          </div>
        </div>
      ) : (
        <div
          className="flex flex-row gap-2 items-center cursor-pointer select-none"
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
        >
          <div className="font-semibold text-sm">
            Reasoned for a few seconds
          </div>
          <button
            className={cn(
              "rounded-full dark:hover:bg-zinc-800 hover:bg-zinc-200",
              {
                "dark:bg-zinc-800 bg-zinc-200": isExpanded,
              }
            )}
          >
            {isExpanded ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ChevronUpIcon className="h-4 w-4" />
            )}
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="reasoning"
            className="text-sm dark:text-zinc-400 text-zinc-600 flex flex-col gap-4 border-l pl-3 dark:border-zinc-800"
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={variants}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <Response>{part.text}</Response>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
