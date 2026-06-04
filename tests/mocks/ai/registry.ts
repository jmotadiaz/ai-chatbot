import type { MockModelEntry } from "./types";
import { MOCK_CLAUDE_SONNET } from "./helpers/models/claudeSonnet";

export const MOCK_MODELS = {
  claudeSonnet: MOCK_CLAUDE_SONNET,
} as const satisfies Record<string, MockModelEntry>;

export type MockModelId = keyof typeof MOCK_MODELS;
