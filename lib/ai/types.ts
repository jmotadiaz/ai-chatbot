import { UIMessage } from "ai";
import { ModelRoutingMetadata } from "@/lib/ai/workflows/model-routing";

export interface Resource {
  title: string;
  url?: string;
  content: string;
}

export interface MessageMetadata {
  status: "started" | "streaming" | "finished";
  autoModel?: ModelRoutingMetadata;
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
  ["rag"]: RagDataPart;
  ["reasoning"]: ReasoningPart;
  ["chat"]: ChatDataPart;
};

export type ChatbotMessage = UIMessage<MessageMetadata, ChatbotDataPart>;
