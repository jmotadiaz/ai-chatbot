import type { InferUITools, UIMessage } from "ai";
import type { ModelRoutingMetadata } from "@/lib/features/foundation-model/types";
import { RagTool } from "@/lib/features/rag/tool";
import { URLContextTool, WebSearchTool } from "@/lib/features/web-search/tools";
import { Chat, Message } from "@/lib/infrastructure/db/schema";
import {
  URL_CONTEXT_TOOL,
  WEB_SEARCH_TOOL,
} from "@/lib/features/web-search/constants";
import { RAG_TOOL } from "@/lib/features/rag/constants";

export const AGENTS = ["rag", "web", "context7"] as const;
export type Agent = (typeof AGENTS)[number];

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

export interface ReasoningDataPart {
  status: "started" | "finished";
}

export type ChatbotDataPart = {
  ["reasoning"]: ReasoningDataPart;
  ["chat"]: ChatDataPart;
};

export type ChatbotMessage = UIMessage<
  MessageMetadata,
  ChatbotDataPart,
  InferUITools<RagTool & WebSearchTool & URLContextTool>
>;

export type Tool =
  | typeof RAG_TOOL
  | typeof WEB_SEARCH_TOOL
  | typeof URL_CONTEXT_TOOL;

export type Tools = Array<Tool>;

export const TOOLS: Tools = [RAG_TOOL, WEB_SEARCH_TOOL, URL_CONTEXT_TOOL];

// Re-export specific database types for domain usage
export type { Chat, Message };
