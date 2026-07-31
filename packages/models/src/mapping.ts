import { MODEL_CATALOG, type InvocableModelId } from "./catalog";

export const PI_PROVIDER = "opencode-go";

export function toPiModelId(modelId: InvocableModelId): {
  providerId: string;
  modelId: string;
} {
  const entry = MODEL_CATALOG.find((e) => e.id === modelId && e.userInvocable);
  if (!entry || entry.provider.kind !== "opencodeGo") {
    throw new Error(`Unsupported coding agent model: ${modelId}`);
  }
  return { providerId: PI_PROVIDER, modelId: entry.provider.modelId };
}

export function toChatModelId(
  providerId: string,
  modelId: string,
): InvocableModelId | undefined {
  if (providerId !== PI_PROVIDER) return undefined;
  const entry = MODEL_CATALOG.find(
    (e) =>
      e.userInvocable &&
      e.provider.kind === "opencodeGo" &&
      e.provider.modelId === modelId,
  );
  return entry?.id as InvocableModelId | undefined;
}

export function filterAvailableChatModels(
  piModels: Array<{ providerId: string; modelId: string }>,
): InvocableModelId[] {
  return piModels
    .map(({ providerId, modelId }) => toChatModelId(providerId, modelId))
    .filter((m): m is InvocableModelId => m !== undefined)
    .sort();
}
