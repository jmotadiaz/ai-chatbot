import type { chatModelId } from "@/lib/features/foundation-model/config";

/**
 * Binds each behaviour the e2e suite needs to a selectable chat model. This is
 * the only place a mock is tied to a model id, so the `satisfies` below is what
 * catches a model leaving the catalog.
 */
export const CAPABILITY_ALIASES = {
  // basicChat must stay out of MOCK_MODELS so it gets the generic mock, and
  // its declared temperature has to differ from alwaysRefuses' — settings.spec
  // switches between the two to check per-model settings.
  basicChat: "MiMo V2.5 Pro",
  // A second plain model: the hub runs without tools, so its multi-panel test
  // needs two models that just answer.
  basicChatAlt: "Kimi K2.7 Code",
  canExecuteTools: "Deepseek v4 Flash",
  canSeeImages: "Qwen 3.7 Plus",
  canProduceReasoning: "Deepseek v4 Pro",
  // settings.spec asserts a temperature of 1 here.
  alwaysRefuses: "MiniMax M3",
  failsMidStream: "MiMo V2.5",
} as const satisfies Record<string, chatModelId>;

export type CapabilityAlias = keyof typeof CAPABILITY_ALIASES;
