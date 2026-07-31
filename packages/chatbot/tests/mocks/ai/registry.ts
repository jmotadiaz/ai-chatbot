import type { MockModelEntry } from "./types";
import { CAPABILITY_ALIASES } from "./capabilities";
import { MOCK_TOOL_EXECUTION } from "./helpers/models/toolExecution";
import { MOCK_VISION } from "./helpers/models/vision";
import { MOCK_REASONING } from "./helpers/models/reasoning";
import { MOCK_REFUSAL } from "./helpers/models/refusal";
import { MOCK_MID_STREAM_ERROR } from "./helpers/models/midStreamError";

/**
 * Models with specialised behaviour, keyed by catalog id. Built from
 * CAPABILITY_ALIASES so the model a behaviour is bound to is declared once.
 * Models absent from this map fall back to the generic createMockModel.
 */
export const MOCK_MODELS: Record<string, MockModelEntry> = {
  [CAPABILITY_ALIASES.canExecuteTools]: MOCK_TOOL_EXECUTION,
  [CAPABILITY_ALIASES.canSeeImages]: MOCK_VISION,
  [CAPABILITY_ALIASES.canProduceReasoning]: MOCK_REASONING,
  [CAPABILITY_ALIASES.alwaysRefuses]: MOCK_REFUSAL,
  [CAPABILITY_ALIASES.failsMidStream]: MOCK_MID_STREAM_ERROR,
};
