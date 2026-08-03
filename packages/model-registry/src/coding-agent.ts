import { MODEL_REGISTRY } from "./registry";
import type { chatModelId } from "./chat";

const CHAT_TO_PI: Partial<Record<chatModelId, { providerId: string; modelId: string }>> =
  Object.fromEntries(
    Object.values(MODEL_REGISTRY)
      .filter((m) => m.chatEnabled && m.codingAgentMapping)
      .map((m) => [m.id, m.codingAgentMapping!]),
  );

const PI_TO_CHAT: Record<string, chatModelId> = Object.fromEntries(
  Object.entries(CHAT_TO_PI).map(([chat, pi]) => [
    `${pi.providerId}/${pi.modelId}`,
    chat as chatModelId,
  ]),
);

export function toPiModelId(
  chatModelId: chatModelId,
): { providerId: string; modelId: string } {
  const mapping = CHAT_TO_PI[chatModelId];
  if (!mapping) {
    throw new Error(`Unsupported coding agent model: ${chatModelId}`);
  }
  return mapping;
}

export function toChatModelId(
  providerId: string,
  modelId: string,
): chatModelId | undefined {
  return PI_TO_CHAT[`${providerId}/${modelId}`];
}

export function filterAvailableChatModels(
  piModels: Array<{ providerId: string; modelId: string }>,
): chatModelId[] {
  return piModels
    .map(({ providerId, modelId }) => toChatModelId(providerId, modelId))
    .filter((m): m is chatModelId => m !== undefined)
    .sort();
}
