import { UIMessage } from "ai";

export type RefinePromptMode = "chat" | "project";

export interface RefinePromptInput {
  input: string;
  messages?: UIMessage[];
  mode?: RefinePromptMode;
  projectId?: string;
  userId: string;
}
