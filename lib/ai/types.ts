import { UseChatHelpers } from "@ai-sdk/react";
import { UIMessage } from "ai";

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
  unknown,
  {
    ["web-search"]: WebSearchDataPart;
    ["rag"]: RagDataPart;
    notification: Notification;
  }
>;
