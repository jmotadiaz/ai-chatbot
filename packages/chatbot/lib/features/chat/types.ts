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

/**
 * Legacy Model Router metadata.
 *
 * The Model Router itself (query classification into category/complexity,
 * then a model pick) is gone: `router.ts` and its prompts were deleted, and
 * nothing constructs this shape anymore. It is kept only so a
 * `Message.metadata.autoModel` persisted before the removal still decodes
 * and renders — the same treatment as `ChatModeRoutingReason`'s
 * `low_confidence` member.
 */
export interface ModelRoutingMetadata {
  category:
    | "factual"
    | "analytical"
    | "technical"
    | "creative"
    | "prompt_engineering"
    | "image_generation"
    | "conversational"
    | "processing"
    | "other";
  complexity: "simple" | "moderate" | "complex" | "advanced";
  model: string;
}

export interface MessageMetadata {
  status: "started" | "streaming" | "finished";
  /** Legacy: no code path sets this anymore, kept so messages persisted
   * before the Model Router removal still decode and render (see
   * `ModelRoutingMetadata`). */
  autoModel?: ModelRoutingMetadata;
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
