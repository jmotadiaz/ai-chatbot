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

export interface ReasoningPart {
  status: "started" | "finished";
}

export type ChatbotMessage = UIMessage<
  MessageMetadata,
  {
    ["web-search"]: WebSearchDataPart;
    ["rag"]: RagDataPart;
    ["reasoning"]: ReasoningPart;
  }
>;
