"use client";

import { AnimatePresence, motion } from "motion/react";
import React, { useMemo, useState } from "react";
import { useCollapse } from "react-collapsed";
import { Book, ChevronDownIcon, LinkIcon } from "lucide-react";
import type { SourceDocumentUIPart, SourceUrlUIPart } from "ai";
import Image from "next/image";
import { capitalize, cn } from "@/lib/utils";
import { CopyBlock } from "@/components/copy-block";
import type { ChatbotMessage } from "@/lib/ai/types";
import type { ModelRoutingMetadata } from "@/lib/ai/workflows/model-routing";
import { FileThumbnail } from "@/components/attachment-thumbnail";
import { Response } from "@/components/response";
import { segregateMessageParts } from "@/lib/ai/utils";

export interface MessagesProps {
  messages: ChatbotMessage[];
}

export const Messages: React.FC<MessagesProps> = ({ messages }) => {
  return (
    <>
      {messages.map((m, i) => (
        <Message key={i} message={m} />
      ))}
    </>
  );
};

export interface MessageProps {
  message: ChatbotMessage;
}

export const Message: React.FC<MessageProps> = ({ message }) => {
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

interface UserMessageProps {
  message: ChatbotMessage;
}

const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
  const { textParts, fileParts: files } = useMemo(
    () => segregateMessageParts(message),
    [message]
  );
  const text = textParts[0].text ?? "";
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
        <div className="flex flex-col w-full space-y-2">
          {files.length > 0 && (
            <div className="flex space-x-2 items-center justify-end">
              {files.map((part, i) => (
                <FileThumbnail key={`message-${message.id}-${i}`} file={part} />
              ))}
            </div>
          )}
          {text.trim() && (
            <CopyBlock text={text}>
              <div className="flex flex-col max-w-full bg-secondary py-4 pl-4 pr-8 mb-4 rounded-tl-3xl rounded-br-3xl rounded-bl-3xl">
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
          )}
        </div>
      </div>
    </>
  );
};

interface AssistantMessageProps {
  message: ChatbotMessage;
}

const AssistantMessage: React.FC<AssistantMessageProps> = ({ message }) => {
  const { sourceParts } = useMemo(
    () => segregateMessageParts(message),
    [message]
  );
  return (
    <div className={cn("flex gap-4 w-full")}>
      <div className="flex flex-col w-full space-y-4">
        {message.parts.map((part, i) => {
          switch (part.type) {
            case "text":
              return (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={`message-${message.id}-part-${i}`}
                  className="flex flex-row gap-2 items-start w-full"
                >
                  <div className={cn("max-w-full")}>
                    <Response className="[&>*:first-child]:mt-6 [&>*:last-child]:mb-6">
                      {part.text}
                    </Response>
                  </div>
                </motion.div>
              );
            case "file":
              return (
                <div key={`message-${message.id}-file-part-${i}`}>
                  {part.mediaType.startsWith("image/") && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      key={`message-${message.id}-part-${i}`}
                      className="mb-4"
                    >
                      <Image
                        src={part.url}
                        alt={part.filename || "image"}
                        width={500}
                        height={500}
                        className="rounded-lg max-w-full h-auto mx-auto object-contain"
                      />
                    </motion.div>
                  )}
                </div>
              );
            default:
              return null;
          }
        })}
        {message.metadata?.status === "finished" && (
          <>
            <SourceMessagePart sourceParts={sourceParts} />
            {message.metadata?.autoModel && (
              <RouterDetails metadata={message.metadata.autoModel} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

interface SourceMessagePart {
  sourceParts: Array<SourceUrlUIPart | SourceDocumentUIPart>;
}

const SourceMessagePart: React.FC<SourceMessagePart> = ({
  sourceParts: sources,
}) => {
  const { getCollapseProps, getToggleProps, isExpanded } = useCollapse();
  if (sources.length === 0) return null;
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
        {sources.map((part) => (
          <React.Fragment key={part.sourceId}>
            {part.type === "source-url" ? (
              <a
                href={part.url}
                className="font-semibold flex pl-4 items-center space-x-2 text-blue-600 dark:text-blue-500 hover:underline"
                target="_blank"
              >
                <span>
                  <LinkIcon className="h-4 w-4" />
                </span>
                <span>{part.title || part.url}</span>
              </a>
            ) : (
              <div className="font-semibold flex pl-4 items-center space-x-2 text-blue-600 dark:text-blue-500 hover:underline">
                <span></span>
                <Book className="h-4 w-4" />
                <span>{part.title}</span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

interface AutoModelDetailsProps {
  metadata: ModelRoutingMetadata;
}

const RouterDetails: React.FC<AutoModelDetailsProps> = ({ metadata }) => {
  const { getCollapseProps, getToggleProps, isExpanded } = useCollapse();
  return (
    <div className="mb-4">
      <div
        className="font-bold flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 my-2 cursor-pointer select-none"
        {...getToggleProps()}
      >
        Router Details
        <ChevronDownIcon
          className={cn("h-4 w-4", {
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
