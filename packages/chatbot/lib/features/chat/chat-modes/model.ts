import type { ToolLoopAgent, ToolSet } from "ai";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import type {
  CreateAgentOptions,
  ModelConfiguration,
} from "@/lib/infrastructure/ai/types";

/**
 * The turn's model, as the conversation factory hands it to every Chat Mode:
 * the user-selected catalog id plus the chat-level parameter overrides of the
 * turn. It is a value, not an injection point — the functions below go straight
 * to the shared inference kit, so tests substitute the Model Gateway at its
 * HTTP seam instead of faking this module (ADR 0013).
 */
export interface ChatModelSelection {
  selectedModel: chatModelId;
  /** Chat-level temperature/topP/topK; a Chat Mode may override them on top. */
  overrides?: ChatModelOverrides;
}

/** Parameter overrides a caller can apply over the resolved model's defaults. */
export interface ChatModelOverrides {
  temperature?: number;
  topP?: number;
  topK?: number;
}

/**
 * Only the temperature/topP/topK keys the caller actually set, so folding them
 * into a Model Configuration or into `createAgent`'s overrides never clobbers
 * the resolved model's own default with `undefined` (mirrors the
 * `overrides.temperature ?? base.temperature` fallback this replaces).
 */
const definedOverrides = (
  overrides: ChatModelOverrides = {},
): ChatModelOverrides => ({
  ...(overrides.temperature !== undefined && {
    temperature: overrides.temperature,
  }),
  ...(overrides.topP !== undefined && { topP: overrides.topP }),
  ...(overrides.topK !== undefined && { topK: overrides.topK }),
});

/**
 * Resolved Model Configuration of the turn through the kit's
 * `createAgentModel` — tracing included: the catalog's own defaults with the
 * chat-level overrides applied on top. Used where a mode needs the model itself
 * rather than a `ToolLoopAgent`: the Context7 branch (`Context7Agent` is a
 * different, third-party agent class) and message processing's `reasoning` flag
 * (`withMessageProcessing`).
 */
export const resolveChatModel = ({
  selectedModel,
  overrides,
}: ChatModelSelection): ModelConfiguration => ({
  ...inferenceKit.createAgentModel(selectedModel),
  ...definedOverrides(overrides),
});

/**
 * `ToolLoopAgent` of the turn through the kit's `createAgent` — tracing
 * included. Each Chat Mode supplies its own instructions/tools/overrides on
 * top; a mode's own overrides win over the chat-level ones.
 */
export const createChatAgent = <TOOLS extends ToolSet = ToolSet>(
  { selectedModel, overrides }: ChatModelSelection,
  options: CreateAgentOptions<TOOLS> = {},
): ToolLoopAgent<never, TOOLS> =>
  inferenceKit.createAgent<TOOLS>(selectedModel, {
    ...options,
    overrides: {
      ...definedOverrides(overrides),
      ...options.overrides,
    },
  });
