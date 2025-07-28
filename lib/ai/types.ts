import { UIMessage } from "ai";

export interface WebSearchDataPart {
  status: "loading" | "loaded";
}

export type ChatbotMessage = UIMessage<
  unknown,
  { ["web-search"]: WebSearchDataPart }
>;
