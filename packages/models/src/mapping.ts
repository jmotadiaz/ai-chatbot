import { MODEL_CATALOG, type InvocableModelId, type ProviderKind } from "./catalog";

export const PI_PROVIDER = "opencode-go";

/**
 * Config de providers custom (no built-in en Pi) que el generador emite en
 * models.json. Key = pi provider id.
 */
export const CUSTOM_PI_PROVIDERS = {
  meta: {
    baseUrl: "https://api.meta.ai/v1",
    api: "openai-completions",
    apiKeyEnv: "META_API_KEY",
  },
} as const;

/** Pi provider id for a catalog provider kind. */
export function toPiProviderId(kind: ProviderKind): string {
  switch (kind) {
    case "opencodeGo":
      return PI_PROVIDER;
    case "metaModelApi":
      return "meta";
    default:
      throw new Error(`Unsupported Pi provider kind: ${kind}`);
  }
}

export function toPiModelId(modelId: InvocableModelId): {
  providerId: string;
  modelId: string;
} {
  const entry = MODEL_CATALOG.find((e) => e.id === modelId && e.userInvocable);
  if (!entry) {
    throw new Error(`Unsupported coding agent model: ${modelId}`);
  }
  return { providerId: toPiProviderId(entry.provider.kind), modelId: entry.provider.modelId };
}

export function toChatModelId(
  providerId: string,
  modelId: string,
): InvocableModelId | undefined {
  const entry = MODEL_CATALOG.find(
    (e) =>
      e.userInvocable &&
      toPiProviderId(e.provider.kind) === providerId &&
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
