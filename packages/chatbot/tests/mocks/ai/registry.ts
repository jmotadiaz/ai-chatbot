import type { MockModelEntry } from "./types";
import { MOCK_CLAUDE_SONNET } from "./helpers/models/claudeSonnet";
import { MOCK_GEMINI_3_FLASH_VISION } from "./helpers/models/gemini3FlashVision";
import { MOCK_DEEPSEEK_V4_PRO_THINKING } from "./helpers/models/deepseekV4ProThinking";
import { MOCK_KIMI_K2_6_REFUSAL } from "./helpers/models/kimiK2_6Refusal";
import { MOCK_GPT_OSS_ERROR } from "./helpers/models/gptOssError";

export const MOCK_MODELS: Record<string, MockModelEntry> = {
  "Claude Sonnet 4.6": MOCK_CLAUDE_SONNET,
  "Gemini 3 Flash": MOCK_GEMINI_3_FLASH_VISION,
  "Deepseek v4 Pro": MOCK_DEEPSEEK_V4_PRO_THINKING,
  "Kimi K2.6": MOCK_KIMI_K2_6_REFUSAL,
  "GPT OSS": MOCK_GPT_OSS_ERROR,
};
