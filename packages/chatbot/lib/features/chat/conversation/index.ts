import { makeProcessChatResponse } from "./factory";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import { createChatModeRouter } from "@/lib/features/chat/mode-routing";

// The Chat Mode Router is production code in every Environment: Jev 1.13
// through the Decisions API (`decision-default`), reached via the kit's generic
// `decide`. Test determinism comes from the Decisions answers the Mock Model
// Gateway serves over HTTP (ADR 0013), never from a second routing
// implementation selected by the Environment.
export const processChatResponse = makeProcessChatResponse(
  createChatModeRouter(inferenceKit.decide),
);
