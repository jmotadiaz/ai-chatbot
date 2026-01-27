"use client";

import { AnimatePresence, motion } from "motion/react";
import React, { useMemo, useState } from "react";
import { useCollapse } from "react-collapsed";
import { Book, ChevronDownIcon, LinkIcon } from "lucide-react";
import type {
  ReasoningUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
} from "ai";
import Image from "next/image";
import { capitalize, cn } from "@/lib/utils/helpers";
import { CopyBlock } from "@/components/ui/copy-block";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import type { ModelRoutingMetadata } from "@/lib/features/foundation-model/types";
import { FileThumbnail } from "@/components/chat/attachments/thumbnail";
import { Response } from "@/components/chat/response";
import {
  mergeReasoningParts,
  destructuringMessageParts,
} from "@/lib/features/chat/utils";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/chat/reasoning";
import { ChatReload } from "@/components/chat/reload";

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
  showReload?: boolean;
}

export const Message: React.FC<MessageProps> = ({ message, showReload }) => {
  return (
    <AnimatePresence key={message.id}>
      <motion.div
        className="w-full mx-auto wrap-anywhere"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        key={`message-${message.id}`}
        data-role={message.role}
      >
        {message.role === "user" ? (
          <UserMessage message={message} />
        ) : (
          <AssistantMessage message={message} showReload={showReload} />
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
    () => destructuringMessageParts(message),
    [message],
  );
  const text = textParts[0].text ?? "";
  const textFiles = message.metadata?.textFiles || [];
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
    <div className="mb-8 pt-4">
      <div
        className={cn(
          "flex gap-4 w-full ml-auto max-w-full 4xl:max-w-4xl",
          "w-fit",
        )}
      >
        <div className="flex flex-col w-full space-y-2">
          {(files.length > 0 || textFiles.length > 0) && (
            <div className="flex gap-3 max-w-3/4 self-end overflow-x-auto scrollbar-none">
              {files.map((part, i) => (
                <FileThumbnail key={`message-${message.id}-${i}`} file={part} />
              ))}
              {textFiles.map((file, i) => (
                <FileThumbnail
                  key={`message-${message.id}-text-${i}`}
                  file={{
                    type: "file",
                    filename: file.filename,
                    mediaType: file.mediaType,
                    url: "",
                  }}
                />
              ))}
            </div>
          )}
          {text.trim() && (
            <CopyBlock text={text}>
              <div className="flex flex-col max-w-full bg-secondary py-4 pl-4 pr-8 rounded-tl-3xl rounded-br-3xl rounded-bl-3xl">
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
    </div>
  );
};

interface AssistantMessageProps {
  message: ChatbotMessage;
  showReload?: boolean;
}

const AssistantMessage: React.FC<AssistantMessageProps> = ({
  message,
  showReload,
}) => {
  const { sourceParts, reasoningParts } = useMemo(
    () => destructuringMessageParts(message),
    [message],
  );

  const mergedReasoning = useMemo(
    () => mergeReasoningParts(reasoningParts),
    [reasoningParts],
  );

  // Check if message has text tokens (to auto-close reasoning)
  const hasTextTokens = message.parts.some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );

  return (
    <div className={cn("flex w-full")}>
      <div className="flex flex-col w-full space-y-4">
        {mergedReasoning && (
          <ReasoningPart
            key={`message-${message.id}-reasoning`}
            part={mergedReasoning}
            isStreaming={
              mergedReasoning.state === "streaming" && !hasTextTokens
            }
            hasTextTokens={hasTextTokens}
          />
        )}

        {message.parts.map((part, i) => {
          switch (part.type) {
            case "text":
              return (
                <div
                  key={`message-${message.id}-part-${i}`}
                  className={cn("max-w-full")}
                >
                  <CopyBlock className="pt-2 -top-2" text={part.text}>
                    <Response
                      isAnimating={part.state === "streaming"}
                      className="[&>*:first-child]:mt-6 [&>*:last-child]:mb-6"
                    >
                      {part.text}
                    </Response>
                  </CopyBlock>
                </div>
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
          <AssistantMessageActions
            showReload={showReload}
            sourceParts={sourceParts}
            routingMetadata={message.metadata.autoModel}
          />
        )}
      </div>
    </div>
  );
};

const AssistantMessageActions: React.FC<{
  showReload?: boolean;
  sourceParts: Array<SourceUrlUIPart | SourceDocumentUIPart>;
  routingMetadata?: ModelRoutingMetadata;
}> = ({ showReload, sourceParts, routingMetadata }) => {
  const [activeSection, setActiveSection] = useState<
    "router" | "sources" | null
  >(null);

  const toggleSection = (section: "router" | "sources") => {
    setActiveSection((prev) => (prev === section ? null : section));
  };

  return (
    <div className="overflow-x-auto no-scrollbar">
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-center gap-3">
          {showReload && <ChatReload />}
          {routingMetadata && (
            <RouterDetailsTrigger
              isExpanded={activeSection === "router"}
              onToggle={() => toggleSection("router")}
            />
          )}
          {sourceParts.length > 0 && (
            <SourceMessagePartTrigger
              count={sourceParts.length}
              isExpanded={activeSection === "sources"}
              onToggle={() => toggleSection("sources")}
            />
          )}
        </div>

        <div className="flex flex-col">
          {routingMetadata && (
            <RouterDetailsContent
              metadata={routingMetadata}
              isExpanded={activeSection === "router"}
            />
          )}
          {sourceParts.length > 0 && (
            <SourceMessagePartContent
              sourceParts={sourceParts}
              isExpanded={activeSection === "sources"}
            />
          )}
        </div>
      </div>
    </div>
  );
};

interface ReasoningPartProps {
  part: ReasoningUIPart;
  isStreaming: boolean;
  hasTextTokens: boolean;
}

const ReasoningPart: React.FC<ReasoningPartProps> = ({
  part,
  isStreaming,
  hasTextTokens,
}) => {
  return (
    <Reasoning isStreaming={isStreaming} hasTextTokens={hasTextTokens}>
      <ReasoningTrigger />
      <ReasoningContent>{part.text}</ReasoningContent>
    </Reasoning>
  );
};

interface SourceMessagePartProps {
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}

const SourceMessagePartTrigger: React.FC<SourceMessagePartProps> = ({
  count,
  isExpanded,
  onToggle,
}) => {
  return (
    <div
      className="flex text-sm font-bold items-center text-zinc-500 dark:text-zinc-400 cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors break-words [overflow-wrap:anywhere]"
      onClick={onToggle}
    >
      Used {count} sources
      <ChevronDownIcon
        className={cn("h-4 w-4 ml-1 transition-transform duration-200", {
          "rotate-180": isExpanded,
        })}
      />
    </div>
  );
};

const SourceMessagePartContent: React.FC<{
  sourceParts: Array<SourceUrlUIPart | SourceDocumentUIPart>;
  isExpanded: boolean;
}> = ({ sourceParts, isExpanded }) => {
  const { getCollapseProps } = useCollapse({ isExpanded });

  return (
    <div
      className="flex flex-col space-y-2 text-sm ml-2 pl-3 my-2 py-1 border-l-4 border-secondary overflow-hidden"
      {...getCollapseProps()}
    >
      {sourceParts.map((part) => (
        <React.Fragment key={part.sourceId}>
          {part.type === "source-url" ? (
            <a
              href={part.url}
              className="font-semibold flex items-center space-x-2 text-zinc-500 dark:text-zinc-400 hover:underline cursor-pointer"
              target="_blank"
            >
              <span>
                <LinkIcon className="h-4 w-4" />
              </span>
              <span>{part.title || part.url}</span>
            </a>
          ) : (
            <div className="font-semibold flex items-center space-x-2 text-zinc-500 dark:text-zinc-400">
              <span>
                <Book className="h-4 w-4" />
              </span>
              <span>{part.title}</span>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

interface RouterDetailsProps {
  isExpanded: boolean;
  onToggle: () => void;
}

const RouterDetailsTrigger: React.FC<RouterDetailsProps> = ({
  isExpanded,
  onToggle,
}) => {
  return (
    <div
      className="font-bold flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors break-words [overflow-wrap:anywhere]"
      onClick={onToggle}
    >
      Router Details
      <ChevronDownIcon
        className={cn("h-4 w-4 transition-transform duration-200", {
          "rotate-180": isExpanded,
        })}
      />
    </div>
  );
};

const RouterDetailsContent: React.FC<{
  metadata: ModelRoutingMetadata;
  isExpanded: boolean;
}> = ({ metadata, isExpanded }) => {
  const { getCollapseProps } = useCollapse({ isExpanded });
  return (
    <div className="overflow-hidden" {...getCollapseProps()}>
      <div className="flex flex-col space-y-1 text-sm ml-2 pl-3 my-2 text-zinc-500 dark:text-zinc-400 py-1 border-l-4 border-secondary">
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
