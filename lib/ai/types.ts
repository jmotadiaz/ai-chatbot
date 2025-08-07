import { UIMessage } from "ai";

export interface MessageMetadata {
  status: "started" | "streaming" | "finished";
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
