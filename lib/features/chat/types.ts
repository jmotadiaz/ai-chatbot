import type { UIMessage } from "ai";
import type { ModelRoutingMetadata } from "@/lib/features/models/types";
import { RagTool } from "@/lib/features/rag/tool";
import { URLContextTool, WebSearchTool } from "@/lib/ai/tools/web-search";
import { Chat, Message } from "@/lib/db/schema";

export interface TextFile {
  filename: string;
  content: string;
  mediaType: string;
}

export interface MessageMetadata {
  status: "started" | "streaming" | "finished";
  autoModel?: ModelRoutingMetadata;
  textFiles?: TextFile[];
}

export interface ChatDataPart {
  id: string;
}

export interface ReasoningPart {
  status: "started" | "finished";
}

export type ChatbotDataPart = {
  ["reasoning"]: ReasoningPart;
  ["chat"]: ChatDataPart;
};

export type ChatbotMessage = UIMessage<
  MessageMetadata,
  ChatbotDataPart,
  RagTool & WebSearchTool & URLContextTool
>;

// Re-export specific database types for domain usage
export type { Chat, Message };
