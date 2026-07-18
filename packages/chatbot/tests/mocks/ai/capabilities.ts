export const CAPABILITY_ALIASES = {
  basicChat: "Gemini 3 Flash",
  canExecuteTools: "Claude Sonnet 4.6",
  canSeeImages: "Gemini 3 Flash",
  canProduceReasoning: "Deepseek v4 Pro",
  alwaysRefuses: "Kimi K2.6",
  failsMidStream: "GPT OSS",
} as const satisfies Record<string, string>;

export type CapabilityAlias = keyof typeof CAPABILITY_ALIASES;
