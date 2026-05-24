import { chatDbAdapter } from "./adapters/db-adapter";
import { chatProjectAdapter } from "./adapters/project-adapter";
import { makeProcessChatResponse } from "./factory";
import { compactionDbAdapter, compactionAiAdapter } from "@/lib/features/compaction";

export const processChatResponse = makeProcessChatResponse(
  chatDbAdapter,
  chatProjectAdapter,
  compactionDbAdapter,
  compactionAiAdapter,
);

export * from "./ports";
