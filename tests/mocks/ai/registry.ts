import type { MockModelEntry } from "./types";
import { MOCK_CLAUDE_SONNET } from "./helpers/models/claudeSonnet";

export const MOCK_MODELS: Record<string, MockModelEntry> = {
  "Claude Sonnet 4.6": MOCK_CLAUDE_SONNET,
};
