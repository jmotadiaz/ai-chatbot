"use client";

import { AnimatePresence, motion } from "motion/react";
import React, { useCallback, useEffect, useState } from "react";
import { useCollapse } from "react-collapsed";
import { ChevronDownIcon, ChevronUpIcon, LinkIcon } from "lucide-react";
import { ReasoningUIPart } from "ai";
import { Markdown } from "@/components/markdown";
import { SpinnerIcon } from "@/components/icons";
import { capitalize, cn } from "@/lib/utils";
import { CopyBlock } from "@/components/copy-block";
import { ChatbotMessage } from "@/lib/ai/types";
import { ModelRoutingMetadata } from "@/lib/ai/workflows/model-routing";
import { FileThumbnail } from "@/components/attachment-thumbnail";

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
        className="w-full mx-auto px-4 wrap-anywhere"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        key={`message-${message.id}`}
        data-role={message.role}
      >
        {message.role === "user" ? (
          <UserMessage message={message} />
        ) : (
          <AssistantMessage message={message} />
        )}
      </motion.div>
    </AnimatePresence>
  );
};

interface ReasoningMessagePartProps {
  part: ReasoningUIPart;
  isReasoningDone: boolean;
}

const ReasoningMessagePart: React.FC<ReasoningMessagePartProps> = ({
  part,
  isReasoningDone,
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
    <div className="flex flex-col">
      {!isReasoningDone ? (
        <div className="flex flex-row gap-2 items-center">
          <div className="font-semibold text-sm">Reasoning</div>
          <div className="animate-spin">
            <SpinnerIcon />
          </div>
        </div>
      ) : (
        <div className="flex flex-row gap-2 items-center">
          <div className="font-semibold text-sm">
            Reasoned for a few seconds
          </div>
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
  message: ChatbotMessage;
}

const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
  const text = message.parts.find((part) => part.type === "text")?.text || "";
  const files = message.parts?.filter((part) => part.type === "file");
  const isLongMessage = text.length > 350;
  const [isCollapseTransitionEnd, setIsCollapseTransitionEnd] = useState(true);
  const { getCollapseProps, getToggleProps, isExpanded } = useCollapse({
    collapsedHeight: 16 * 1.5 * 3, // 3 lines of text + margin
    defaultExpanded: !isLongMessage,
    onTransitionStateChange: (state) => {
      setIsCollapseTransitionEnd(state === "collapseEnd");
    },
  });

  return (
    <>
      <div className={cn("flex gap-4 w-full ml-auto max-w-4xl mt-4", "w-fit")}>
        <div className="flex flex-col w-full space-y-4">
          <CopyBlock text={text}>
            <div className="flex flex-col max-w-full bg-secondary text-secondary-foreground py-4 pl-4 pr-8 mb-4 rounded-tl-xl rounded-tr-xl rounded-bl-xl">
              <>
                <motion.div
                  initial={{ y: 5, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="flex flex-row gap-2 items-start w-full"
                >
                  <div
                    className={cn({
                      "line-clamp-3 ![display:-webkit-box]":
                        !isExpanded && isCollapseTransitionEnd,
                    })}
                    {...getCollapseProps()}
                  >
                    {text}
                  </div>
                </motion.div>
              </>
              {isLongMessage && (
                <div className="pt-2 flex justify-end text-sm text-zinc-500 dark:text-zinc-400">
                  <button
                    {...getToggleProps()}
                    className="hover:text-zinc-700 dark:hover:text-zinc-200 font-semibold cursor-pointer"
                  >
                    Show {isExpanded ? "less" : "more"}
                  </button>
                </div>
              )}
            </div>
          </CopyBlock>
        </div>
      </div>
      {files.length > 0 && (
        <div className="flex space-x-3 items-center justify-end my-4">
          {files.map((part, i) => (
            <FileThumbnail key={`message-${message.id}-${i}`} file={part} />
          ))}
        </div>
      )}
    </>
  );
};

interface AssistantMessageProps {
  message: ChatbotMessage;
}

const AssistantMessage: React.FC<AssistantMessageProps> = ({ message }) => {
  return (
    <div className={cn("flex gap-4 w-full")}>
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
                    <div className={cn("max-w-full")}>
                      <Markdown content={part.text} />
                    </div>
                  </motion.div>
                );
              case "reasoning":
                return (
                  <ReasoningMessagePart
                    key={`message-${message.id}-${i}`}
                    part={part}
                    isReasoningDone={
                      part.state === "done" ||
                      message.parts?.some(({ type }) => type === "text")
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
        {message.metadata?.autoModel && (
          <AutoModelDetails metadata={message.metadata.autoModel} />
        )}
      </div>
    </div>
  );
};

interface SourceMessagePart {
  message: ChatbotMessage;
}

const SourceMessagePart: React.FC<SourceMessagePart> = ({ message }) => {
  const { getCollapseProps, getToggleProps, isExpanded } = useCollapse();
  const sources = message.parts?.filter((part) => part.type === "source-url");
  return (
    <div className="mb-3 text-sm">
      <div
        className="flex text-sm font-bold items-center text-zinc-500 dark:text-zinc-400 mb-2 cursor-pointer select-none"
        {...getToggleProps()}
      >
        Used {sources.length} sources
        <ChevronDownIcon
          className={cn("h-4 w-4 ml-1", {
            "rotate-180": isExpanded,
          })}
        />
      </div>
      <div
        className="flex flex-col items-start space-y-2"
        {...getCollapseProps()}
      >
        {sources.map((part) => {
          return (
            <a
              key={`source-${part.sourceId}`}
              href={part.url}
              className="font-semibold flex pl-4 items-center space-x-2 text-blue-600 dark:text-blue-500 hover:underline"
              target="_blank"
            >
              <LinkIcon className="h-4 w-4" />
              <span>{part.title || part.url}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
};

interface AutoModelDetailsProps {
  metadata: ModelRoutingMetadata;
}

const AutoModelDetails: React.FC<AutoModelDetailsProps> = ({ metadata }) => {
  const { getCollapseProps, getToggleProps, isExpanded } = useCollapse();
  return (
    <div className="mb-4">
      <div
        className="font-bold flex items-center text-sm text-zinc-500 dark:text-zinc-400 my-2 cursor-pointer select-none"
        {...getToggleProps()}
      >
        Auto Model Details{" "}
        <ChevronDownIcon
          className={cn("h-4 w-4 ml-1", {
            "rotate-180": isExpanded,
          })}
        />
      </div>
      <div
        className="flex flex-col space-y-1 text-sm ml-2 pl-3 text-zinc-500 dark:text-zinc-400 border-l-4 border-secondary"
        {...getCollapseProps()}
      >
        <div>
          <span className="font-semibold">Category:</span>{" "}
          {capitalize(metadata.category)}
        </div>
        <div>
          <span className="font-semibold">Complexity:</span>{" "}
          {capitalize(metadata.complexity)}
        </div>
        <div>
          <span className="font-semibold">Model:</span> {metadata.model}
        </div>
      </div>
    </div>
  );
};
