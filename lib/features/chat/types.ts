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

/**
 * Prompts that instruct the model to use specific tools.
 * Used when toolCallingByPrompt is enabled (e.g., for models with extended thinking).
 */
export const TOOL_PROMPTS: Record<Tool, string> = {
  [RAG_TOOL]:
    "IMPORTANT: You MUST use the 'rag' tool to search the knowledge base before providing your response. Do not respond without first calling this tool.",
  [URL_CONTEXT_TOOL]:
    "IMPORTANT: You MUST use the 'urlContext' tool to fetch and analyze the content from the URLs mentioned in the conversation. Do not respond without first calling this tool.",
  [WEB_SEARCH_TOOL]:
    "IMPORTANT: You MUST use the 'webSearch' tool to search the web for current and relevant information. Do not respond without first calling this tool.",
};

// Re-export specific database types for domain usage
export type { Chat, Message };
