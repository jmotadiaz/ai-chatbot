import type { UIMessage } from "ai";
import type { ModelRoutingMetadata } from "@/lib/ai/workflows/model-routing";
import { RagTool } from "@/lib/ai/tools/rag";

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

export interface WebSearchDataPart {
  status: "loading" | "loaded";
}

export interface RagDataPart {
  status: "loading" | "loaded";
}

export interface ChatDataPart {
  id: string;
}

export interface ReasoningPart {
  status: "started" | "finished";
}

export type ChatbotDataPart = {
  ["web-search"]: WebSearchDataPart;
  ["reasoning"]: ReasoningPart;
  ["chat"]: ChatDataPart;
  ["rag"]: RagDataPart;
};

export type ChatbotMessage = UIMessage<
  MessageMetadata,
  ChatbotDataPart,
  RagTool
>;
