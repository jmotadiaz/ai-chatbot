import type { UIMessage } from "ai";
import type { ModelRoutingMetadata } from "@/lib/ai/workflows/model-routing";
import { RagTool } from "@/lib/ai/tools/rag";
import { URLContextTool, WebSearchTool } from "@/lib/ai/tools/web-search";

export interface Resource {
  title: string;
  url?: string;
  content: string;
}

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
