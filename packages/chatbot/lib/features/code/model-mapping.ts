import type { chatModelId } from "@/lib/features/foundation-model/config";

const PI_PROVIDER = "opencode-go";

const CHAT_TO_PI: Partial<Record<chatModelId, string>> = {
  "Deepseek v4 Flash": "deepseek-v4-flash",
  "Deepseek v4 Pro": "deepseek-v4-pro",
  "Kimi K2.6": "kimi-k2.6",
  "Qwen 3.6 Plus": "qwen3.6-plus",
  "MiMo V2.5": "mimo-v2.5",
  "MiMo V2.5 Pro": "mimo-v2.5-pro",
};

const PI_TO_CHAT: Record<string, chatModelId> = Object.fromEntries(
  Object.entries(CHAT_TO_PI).map(([chat, pi]) => [pi, chat as chatModelId]),
);

export function toPiModelId(
  chatModelId: chatModelId,
): { providerId: string; modelId: string } {
  const modelId = CHAT_TO_PI[chatModelId];
  if (!modelId) {
    throw new Error(`Unsupported coding agent model: ${chatModelId}`);
  }
  return { providerId: PI_PROVIDER, modelId };
}

export function toChatModelId(
  providerId: string,
  modelId: string,
): chatModelId | undefined {
  if (providerId !== PI_PROVIDER) return undefined;
  return PI_TO_CHAT[modelId];
}

export function filterAvailableChatModels(
  piModels: Array<{ providerId: string; modelId: string }>,
): chatModelId[] {
  return piModels
    .map(({ providerId, modelId }) => toChatModelId(providerId, modelId))
    .filter((m): m is chatModelId => m !== undefined)
    .sort();
}
