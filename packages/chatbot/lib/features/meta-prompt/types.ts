import { UIMessage } from "ai";

export type RefinePromptMode = "chat" | "project" | "coding-agent";

export interface RefinePromptInput {
  input: string;
  messages?: UIMessage[];
  mode?: RefinePromptMode;
  projectId?: string;
  userId: string;
}
