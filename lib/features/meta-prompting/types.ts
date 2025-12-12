import { UIMessage } from "ai";

export interface RefinePromptInput {
  input: string;
  messages?: UIMessage[];
  metaPrompt?: string;
}
