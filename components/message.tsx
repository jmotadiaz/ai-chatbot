"use client";

import { AnimatePresence, motion } from "motion/react";
import React, { useCallback, useEffect, useState } from "react";
import { useCollapse } from "react-collapsed";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { ReasoningUIPart } from "ai";
import { Markdown } from "@/components/markdown";
import { DotsLoadingIcon, SpinnerIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { CopyBlock } from "@/components/copy-block";
import { ChatbotMessage } from "@/lib/ai/types";

export const Message = ({
  message,
}: {
  message: ChatbotMessage;
  isLoading: boolean;
  isLatestMessage: boolean;
}) => {
  return (
    <AnimatePresence key={message.id}>
      <motion.div
        className="w-full mx-auto px-4 group/message wrap-anywhere"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        key={`message-${message.id}`}
        data-role={message.role}
      >
        <div
          className={cn(
            "flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-4xl",
            "group-data-[role=user]/message:w-fit"
          )}
        >
          <div className="flex flex-col w-full space-y-4">
            {message.parts
              ?.filter((part) => part.type !== "source-url")
              .map((part, i) => {
                switch (part.type) {
                  case "text":
                    return (
                      <motion.div
                        initial={{ y: 5, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        key={`message-${message.id}-part-${i}`}
                        className="flex flex-row gap-2 items-start w-full"
                      >
                        {message.role === "user" ? (
                          <CopyBlock
                            text={part.text}
                            className={cn(
                              "flex flex-col max-w-full bg-secondary text-secondary-foreground py-2 pl-4 pr-8 mb-4 rounded-tl-xl rounded-tr-xl rounded-bl-xl"
                            )}
                          >
                            <UserMessage text={part.text} />
                          </CopyBlock>
                        ) : (
                          <div className={cn("max-w-full")}>
                            <Markdown content={part.text} />
                          </div>
                        )}
                      </motion.div>
                    );
                  case "data-web-search":
                    if (part.data.status === "loading") {
                      return (
                        <ToolLoading
                          key={`tool-web-search-${part.id}`}
                          text="Searching the web"
                        />
                      );
                    }
                    return null;
                  case "data-rag":
                    if (part.data.status === "loading") {
                      return (
                        <ToolLoading
                          key={`tool-web-search-${part.id}`}
                          text="Searching documents"
                        />
                      );
                    }
                    return null;
                  case "reasoning":
                    return (
                      <ReasoningMessagePart
                        key={`message-${message.id}-${i}`}
                        part={part}
                        isReasoning={
                          !(
                            part.state === "done" ||
                            message.parts?.some(({ type }) => type === "text")
                          )
                        }
                      />
                    );
                  default:
                    return null;
                }
              })}
            {message.metadata?.status === "finished" &&
              message.parts?.some((part) => part.type === "source-url") && (
                <SourceMessagePart message={message} />
              )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

interface ReasoningMessagePartProps {
  part: ReasoningUIPart;
  isReasoning: boolean;
}

const ReasoningMessagePart: React.FC<ReasoningMessagePartProps> = ({
  part,
  isReasoning,
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
    memoizedSetIsExpanded(isReasoning);
  }, [isReasoning, memoizedSetIsExpanded]);

  return (
    <div className="flex flex-col">
      {isReasoning ? (
        <div className="flex flex-row gap-2 items-center">
          <div className="font-medium text-sm">Reasoning</div>
          <div className="animate-spin">
            <SpinnerIcon />
          </div>
        </div>
      ) : (
        <div className="flex flex-row gap-2 items-center">
          <div className="font-medium text-sm">Reasoned for a few seconds</div>
          <button
            className={cn(
              "cursor-pointer rounded-full dark:hover:bg-zinc-800 hover:bg-zinc-200",
              {
                "dark:bg-zinc-800 bg-zinc-200": isExpanded,
              }
            )}
            onClick={() => {
              setIsExpanded(!isExpanded);
            }}
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
            <Markdown content={part.text} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface UserMessageProps {
  text: string;
}

const UserMessage: React.FC<UserMessageProps> = ({ text }) => {
  const isLongMessage = text.length > 350;
  const [isCollapseTransitionEnd, setIsCollapseTransitionEnd] = useState(true);
  const { getCollapseProps, getToggleProps, isExpanded } = useCollapse({
    collapsedHeight: 16 * 1.5 * 3 + 16, // 3 lines of text + margin
    defaultExpanded: !isLongMessage,
    onTransitionStateChange: (state) => {
      setIsCollapseTransitionEnd(state === "collapseEnd");
    },
  });

  return (
    <>
      <div
        className={cn({
          "line-clamp-3 ![display:-webkit-box]":
            !isExpanded && isCollapseTransitionEnd,
        })}
        {...getCollapseProps()}
      >
        <Markdown content={text} />
      </div>

      {isLongMessage && (
        <div className="pt-2 flex justify-end text-sm text-zinc-500 dark:text-zinc-400">
          <button
            {...getToggleProps()}
            className="hover:text-zinc-700 dark:hover:text-zinc-200 font-medium cursor-pointer"
          >
            Show {isExpanded ? "less" : "more"}
          </button>
        </div>
      )}
    </>
  );
};

interface SourceMessagePart {
  message: ChatbotMessage;
}

const SourceMessagePart: React.FC<SourceMessagePart> = ({ message }) => {
  return (
    <>
      <div className="text-xl text-zinc-500 dark:text-zinc-400">
        <span className="font-medium">Sources:</span>
      </div>
      <ul className="list-disc pl-10 mb-4">
        {message.parts
          ?.filter((part) => part.type === "source-url")
          .map((part) => {
            return (
              <li className="text-ellipsis" key={`source-${part.sourceId}`}>
                <a
                  href={part.url}
                  className="font-medium text-sm text-blue-600 dark:text-blue-500 hover:underline"
                  target="_blank"
                >
                  {part.title || part.url}
                </a>
              </li>
            );
          })}
      </ul>
    </>
  );
};

interface ToolLoadingProps {
  text: string;
}

const ToolLoading: React.FC<ToolLoadingProps> = ({ text }) => {
  return (
    <div className="flex items-center mt-2">
      <DotsLoadingIcon />
      <div className="ml-4 font-medium">{text}</div>
    </div>
  );
};
