"use client";

import { AnimatePresence, motion } from "motion/react";
import React, { useMemo, useState } from "react";
import { useCollapse } from "react-collapsed";
import { Book, ChevronDownIcon, LinkIcon } from "lucide-react";
import type {
  SourceDocumentUIPart,
  SourceUrlUIPart,
} from "ai";
import Image from "next/image";
import { cn } from "@/lib/utils/helpers";
import { CopyBlock } from "@/components/ui/copy-block";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import type {
  ChatModeRoutingMetadata,
  ResolvedChatMode,
} from "@/lib/features/chat/mode-routing/types";
import { Response } from "@/components/chat/response";
import {
  mergeReasoningParts,
  destructuringMessageParts,
} from "@/lib/features/chat/utils";
import { RagSourceMessagePart } from "@/components/chat/rag-source";
import { Context7SourceMessagePart } from "@/components/chat/context7-source";
import type { RagChunk } from "@/lib/features/rag/types";
import {
  ChatReloadButton,
  ChatReloadSelectors,
} from "@/components/chat/reload";
import { ReasoningBlock } from "@/components/chat/reasoning";
import { UserMessage } from "@/components/chat/user-message";
import type { FilePart } from "@/lib/features/attachment/types";

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
          <ChatbotUserMessage message={message} />
        ) : (
          <AssistantMessage message={message} showReload={showReload} />
        )}
      </motion.div>
    </AnimatePresence>
  );
};

interface ChatbotUserMessageProps {
  message: ChatbotMessage;
}

const ChatbotUserMessage: React.FC<ChatbotUserMessageProps> = ({ message }) => {
  const { textParts, fileParts: files } = useMemo(
    () => destructuringMessageParts(message),
    [message],
  );
  const text = textParts[0]?.text ?? "";
  const displayFiles = useMemo<FilePart[]>(() => {
    const textFiles =
      message.metadata?.textFiles?.map((file) => ({
        type: "file" as const,
        filename: file.filename,
        mediaType: file.mediaType,
        url: "",
      })) ?? [];

    return [...files, ...textFiles];
  }, [files, message.metadata?.textFiles]);

  return (
    <UserMessage text={text} files={displayFiles} messageId={message.id} />
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
  const { sourceParts, reasoningParts, ragSourceParts, context7Parts } =
    useMemo(() => destructuringMessageParts(message), [message]);

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
          <ReasoningBlock
            key={`message-${message.id}-reasoning`}
            text={mergedReasoning.text}
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
            ragSourceParts={ragSourceParts}
            context7Parts={context7Parts}
            chatModeRouting={message.metadata.chatModeRouting}
          />
        )}
      </div>
    </div>
  );
};

const AssistantMessageActions: React.FC<{
  showReload?: boolean;
  sourceParts: Array<SourceUrlUIPart | SourceDocumentUIPart>;
  ragSourceParts: RagChunk[][];
  context7Parts: { libraryId: string; output: string }[];
  chatModeRouting?: ChatModeRoutingMetadata;
}> = ({
  showReload,
  sourceParts,
  ragSourceParts,
  context7Parts,
  chatModeRouting,
}) => {
  const [activeSection, setActiveSection] = useState<
    "chat-mode" | "sources" | "rag-sources" | "context7-sources" | null
  >(null);

  const toggleSection = (
    section: "chat-mode" | "sources" | "rag-sources" | "context7-sources",
  ) => {
    setActiveSection((prev) => (prev === section ? null : section));
  };

  const hasDetails =
    chatModeRouting !== undefined ||
    sourceParts.length > 0 ||
    context7Parts.length > 0 ||
    ragSourceParts.length > 0;

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-4 min-w-0">
      {showReload && (
        <>
          <ChatReloadButton />
          <ChatReloadSelectors />
        </>
      )}
      {hasDetails && (
        <>
          {/* Empty first cell: the triggers share the icon column, so they
              stay aligned with the reload text above by construction. */}
          <div aria-hidden="true" />
          <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          {chatModeRouting && (
            <ChatModeRoutingTrigger
              isExpanded={activeSection === "chat-mode"}
              onToggle={() => toggleSection("chat-mode")}
            />
          )}
          {sourceParts.length > 0 && (
            <>
              {chatModeRouting && (
                <div className="w-[1px] h-4 bg-zinc-300 dark:bg-zinc-700 shrink-0"></div>
              )}
              <SourceMessagePartTrigger
                count={sourceParts.length}
                isExpanded={activeSection === "sources"}
                onToggle={() => toggleSection("sources")}
              />
            </>
          )}

          {context7Parts.length > 0 && (
            <>
              {(chatModeRouting || sourceParts.length > 0) && (
                <div className="w-[1px] h-4 bg-zinc-300 dark:bg-zinc-700 shrink-0"></div>
              )}
              <div
                className="font-bold flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors break-words [overflow-wrap:anywhere]"
                onClick={() => toggleSection("context7-sources")}
              >
                Documentation
                <ChevronDownIcon
                  className={cn("h-4 w-4 transition-transform duration-200", {
                    "rotate-180": activeSection === "context7-sources",
                  })}
                />
              </div>
            </>
          )}
          {ragSourceParts.length > 0 && (
            <>
              {(chatModeRouting ||
                sourceParts.length > 0 ||
                context7Parts.length > 0) && (
                <div className="w-[1px] h-4 bg-zinc-300 dark:bg-zinc-700 shrink-0"></div>
              )}
              <div
                className="font-bold flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors break-words [overflow-wrap:anywhere]"
                onClick={() => toggleSection("rag-sources")}
              >
                Documentation
                <ChevronDownIcon
                  className={cn("h-4 w-4 transition-transform duration-200", {
                    "rotate-180": activeSection === "rag-sources",
                  })}
                />
              </div>
            </>
          )}
          </div>
        </>
      )}

      <div className="flex flex-col col-span-2">
        {chatModeRouting && (
          <ChatModeRoutingContent
            metadata={chatModeRouting}
            isExpanded={activeSection === "chat-mode"}
          />
        )}
        {sourceParts.length > 0 && (
          <SourceMessagePartContent
            sourceParts={sourceParts}
            isExpanded={activeSection === "sources"}
          />
        )}

        {context7Parts.length > 0 && (
          <Context7SourceMessagePart
            sources={context7Parts}
            isExpanded={activeSection === "context7-sources"}
          />
        )}
        {ragSourceParts.length > 0 && (
          <RagSourceMessagePart
            ragSourceParts={ragSourceParts}
            isExpanded={activeSection === "rag-sources"}
          />
        )}
      </div>
    </div>
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
      <span className="hidden md:inline">Used {count} sources</span>
      <span className="md:hidden">Sources</span>
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
    <div {...getCollapseProps()}>
      <div className="py-2 pl-2">
        <div className="flex flex-col space-y-2 text-sm pl-3 py-1 border-l-4 border-secondary overflow-hidden">
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
      </div>
    </div>
  );
};

const RESOLVED_CHAT_MODE_LABELS: Record<ResolvedChatMode, string> = {
  context7: "Ctx7",
  web: "Web",
  neutral: "Neutral",
};

const ChatModeRoutingTrigger: React.FC<{
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ isExpanded, onToggle }) => {
  return (
    <div
      className="font-bold flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors whitespace-nowrap shrink-0"
      onClick={onToggle}
    >
      Mode Auto Details
      <ChevronDownIcon
        className={cn("h-4 w-4 transition-transform duration-200", {
          "rotate-180": isExpanded,
        })}
      />
    </div>
  );
};

const ChatModeRoutingContent: React.FC<{
  metadata: ChatModeRoutingMetadata;
  isExpanded: boolean;
}> = ({ metadata, isExpanded }) => {
  const { getCollapseProps } = useCollapse({ isExpanded });
  return (
    <div className="overflow-hidden" {...getCollapseProps()}>
      <div className="pt-4 pb-2 pl-2">
        <div className="flex flex-col space-y-1 text-sm pl-3 text-zinc-500 dark:text-zinc-400 py-1 border-l-4 border-secondary">
          <div>
            <span className="font-semibold">Mode:</span>{" "}
            {RESOLVED_CHAT_MODE_LABELS[metadata.mode]}
          </div>
          {typeof metadata.confidence === "number" && (
            <div>
              <span className="font-semibold">Confidence:</span>{" "}
              {metadata.confidence.toFixed(2)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
