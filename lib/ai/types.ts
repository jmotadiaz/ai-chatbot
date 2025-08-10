import { UIMessage } from "ai";
import { AutoModelMetadata } from "@/lib/ai/workflows/auto-model";

export interface MessageMetadata {
  status: "started" | "streaming" | "finished";
  autoModel?: AutoModelMetadata;
}

export interface WebSearchDataPart {
  status: "loading" | "loaded";
}

export interface RagDataPart {
  status: "loading" | "loaded";
}

export type ChatbotMessage = UIMessage<
  MessageMetadata,
  {
    ["web-search"]: WebSearchDataPart;
    ["rag"]: RagDataPart;
  }
>;
