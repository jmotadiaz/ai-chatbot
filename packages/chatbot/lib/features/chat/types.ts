import type { InferUITools, UIMessage } from "ai";
import { queryDocs, resolveLibraryId } from "@upstash/context7-tools-ai-sdk";
import type { ChatModeRoutingMetadata } from "@/lib/features/chat/mode-routing/types";
import { RagTool } from "@/lib/features/rag/tool";
import { URLContextTool, WebSearchTool } from "@/lib/features/web-search/tools";
import { Chat, Message } from "@/lib/infrastructure/db/schema";
import {
  URL_CONTEXT_TOOL,
  WEB_SEARCH_TOOL,
} from "@/lib/features/web-search/constants";
import { RAG_TOOL } from "@/lib/features/rag/constants";

export const CHAT_MODES = ["auto", "context7", "rag", "web"] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

/**
 * Mode the answer is produced with. `neutral` is internal (not selectable) and
 * only reachable through Auto routing, so it lives outside `CHAT_MODES`.
 */
export type { ResolvedChatMode } from "@/lib/features/chat/mode-routing/types";

export interface TextFile {
  filename: string;
  content: string;
  mediaType: string;
}

export interface MessageMetadata {
  status: "started" | "streaming" | "finished";
  chatModeRouting?: ChatModeRoutingMetadata;
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

export const Ctxt7Tools = {
  resolveLibraryId: resolveLibraryId(),
  queryDocs: queryDocs(),
};

export type ChatbotMessage = UIMessage<
  MessageMetadata,
  ChatbotDataPart,
  InferUITools<RagTool & WebSearchTool & URLContextTool & typeof Ctxt7Tools>
>;

export type Tool =
  | typeof RAG_TOOL
  | typeof WEB_SEARCH_TOOL
  | typeof URL_CONTEXT_TOOL;

export type Tools = Array<Tool>;

export const TOOLS: Tools = [RAG_TOOL, WEB_SEARCH_TOOL, URL_CONTEXT_TOOL];

// Re-export specific database types for domain usage
export type { Chat, Message };
