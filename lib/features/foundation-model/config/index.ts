import type { ModelConfiguration } from "../types";

import { ALIBABA_CONFIG } from "./alibaba";
import { ANTHROPIC_CONFIG } from "./anthropic";
import { DEEPSEEK_CONFIG } from "./deepseek";
import { GOOGLE_CONFIG } from "./google";
import { META_CONFIG } from "./meta";
import { MINIMAX_CONFIG } from "./minimax";
import { MISTRAL_CONFIG } from "./mistral";
import { MOONSHOTAI_CONFIG } from "./moonshotai";
import { OPENAI_CONFIG } from "./openai";
import { PERPLEXITY_CONFIG } from "./perplexity";
import { XAI_CONFIG } from "./xai";
import { XIAOMI_CONFIG } from "./xiaomi";
import { ZAI_CONFIG } from "./zai";

const LANGUAGE_MODEL_CONFIGURATIONS_CONST = {
  ...META_CONFIG,
  ...MOONSHOTAI_CONFIG,
  ...MISTRAL_CONFIG,
  ...DEEPSEEK_CONFIG,
  ...ALIBABA_CONFIG,
  ...MINIMAX_CONFIG,
  ...XIAOMI_CONFIG,
  ...ZAI_CONFIG,
  ...PERPLEXITY_CONFIG,
  ...ANTHROPIC_CONFIG,
  ...OPENAI_CONFIG,
  ...GOOGLE_CONFIG,
  ...XAI_CONFIG,
} as const satisfies Record<string, ModelConfiguration>;

export { LANGUAGE_MODEL_CONFIGURATIONS_CONST };

export type LanguageModelKeys =
  keyof typeof LANGUAGE_MODEL_CONFIGURATIONS_CONST;

export const chatModelKeys = [
  "Kimi K2",
  "Kimi K2 Thinking",
  "MiniMax M2",
  "GLM-4.7",
  "Qwen3 Instruct",
  "Qwen3 Thinking",
  "MiMo V2 Flash",
  "Deepseek Chat",
  "Deepseek R1",
  "Llama 4 Scout",
  "Llama 4 Maverick",
  "Sonar",
  "Sonar Pro",
  "Claude Haiku 4.5",
  "Claude Sonnet 4.5",
  "Claude Opus 4.5",
  "Grok 4.1 Fast",
  "Grok 4",
  "GPT OSS",
  "GPT 5 Mini",
  "GPT 5.2",
  "Gemini 3 Flash",
  "Gemini 3 Pro",
  "Nano Banana",
] satisfies LanguageModelKeys[];

export type chatModelId = (typeof chatModelKeys)[number] | "Router";

export const CHAT_MODELS: chatModelId[] = ["Router", ...chatModelKeys];
