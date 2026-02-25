import { chatDbAdapter } from "./adapters/db-adapter";
import { chatProjectAdapter } from "./adapters/project-adapter";
import { makeProcessChatResponse } from "./factory";

export const processChatResponse = makeProcessChatResponse(
  chatDbAdapter,
  chatProjectAdapter,
);

export * from "./ports";
