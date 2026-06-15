import { makeProcessChatResponse } from "./factory";
import { compactionAiAdapter } from "@/lib/features/compaction";

export const processChatResponse = makeProcessChatResponse(
  compactionAiAdapter,
);

export * from "./ports";
