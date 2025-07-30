import { UseChatHelpers } from "@ai-sdk/react";
import { UIMessage } from "ai";

export interface MessageMetadata {
  status: "started" | "finished";
}

export interface WebSearchDataPart {
  status: "loading" | "loaded";
}

export interface RagDataPart {
  status: "loading" | "loaded";
}

export interface Notification {
  status: UseChatHelpers<never>["status"];
}

export type ChatbotMessage = UIMessage<
  MessageMetadata,
  {
    ["web-search"]: WebSearchDataPart;
    ["rag"]: RagDataPart;
    notification: Notification;
  }
>;
