"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext, useEffect, useState } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils/helpers";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Shimmer } from "@/components/ui/shimmer";

type ReasoningContextValue = {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  hasTextTokens?: boolean;
};

const AUTO_CLOSE_DELAY = 1000;

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen = false,
    onOpenChange,
    hasTextTokens = false,
    children,
    ...props
  }: ReasoningProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      prop: open,
      defaultProp: defaultOpen,
      onChange: onOpenChange,
    });

    const [hasAutoClosed, setHasAutoClosed] = useState(false);

    // Auto-close when text tokens arrive (higher priority than streaming end)
    useEffect(() => {
      if (hasTextTokens && isOpen && !hasAutoClosed) {
        setIsOpen(false);
        setHasAutoClosed(true);
      }
    }, [hasTextTokens, isOpen, hasAutoClosed, setIsOpen]);

    // Auto-open when streaming starts, auto-close when streaming ends (once only)
    useEffect(() => {
      if (defaultOpen && !isStreaming && isOpen && !hasAutoClosed) {
        // Add a small delay before closing to allow user to see the content
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY);

        return () => clearTimeout(timer);
      }
    }, [isStreaming, isOpen, defaultOpen, setIsOpen, hasAutoClosed]);

    const handleOpenChange = (newOpen: boolean) => {
      setIsOpen(newOpen);
    };

    return (
      <ReasoningContext.Provider
        value={{ isStreaming, isOpen, setIsOpen }}
      >
        <Collapsible
          className={cn("not-prose mb-4", className)}
          onOpenChange={handleOpenChange}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  },
);

export type ReasoningTriggerProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  getThinkingMessage?: (isStreaming: boolean) => ReactNode;
};

const defaultGetThinkingMessage = (isStreaming: boolean) => {
  if (isStreaming) {
    return (
      <div className="font-semibold text-base text-zinc-500 dark:text-zinc-400">
        <Shimmer duration={1}>Thinking</Shimmer>
      </div>
    );
  }

  return (
    <p className="font-semibold text-base text-zinc-500 dark:text-zinc-400">
      Thinking
    </p>
  );
};

export const ReasoningTrigger = memo(
  ({
    className,
    children,
    getThinkingMessage = defaultGetThinkingMessage,
    ...props
  }: ReasoningTriggerProps) => {
    const { isStreaming, isOpen } = useReasoning();

    const content = children ?? (
      <>
        {getThinkingMessage(isStreaming)}
        <ChevronDownIcon
          className={cn(
            "size-4 transition-transform",
            isOpen ? "rotate-180" : "rotate-0",
          )}
        />
      </>
    );

    return (
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center space-x-2 text-muted-foreground text-sm transition-colors hover:text-foreground cursor-pointer user-select-none",
          className,
        )}
        {...props}
      >
        {content}
      </CollapsibleTrigger>
    );
  },
);

export type ReasoningContentProps = ComponentProps<
  typeof CollapsibleContent
> & {
  children: string;
};

export const ReasoningContent = memo(
  ({ className, children, ...props }: ReasoningContentProps) => (
    <CollapsibleContent
      className={cn(
        "mt-4 text-sm",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
        className,
      )}
      {...props}
    >
      <Streamdown {...props}>{children}</Streamdown>
    </CollapsibleContent>
  ),
);

interface ReasoningBlockProps {
  text: string;
  isStreaming?: boolean;
  hasTextTokens?: boolean;
}

export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({
  text,
  isStreaming = false,
  hasTextTokens = false,
}) => {
  return (
    <Reasoning isStreaming={isStreaming} hasTextTokens={hasTextTokens}>
      <ReasoningTrigger />
      <ReasoningContent>{text}</ReasoningContent>
    </Reasoning>
  );
};

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
