import { MODEL_CATALOG, type InvocableModelId, type ProviderKind } from "./catalog";

export const PI_PROVIDER = "opencode-go";

/** Pi provider id for a catalog provider kind. */
export function toPiProviderId(kind: ProviderKind): string {
  switch (kind) {
    case "opencodeGo":
    case "opencodeGoResponses":
      return PI_PROVIDER;
    // Pi trae OpenCode Zen como provider built-in "opencode" (env
    // OPENCODE_API_KEY, la misma que opencode-go).
    case "opencodeZen":
      return "opencode";
    // Pi ships the Vercel AI Gateway as a built-in provider (env key
    // AI_GATEWAY_API_KEY), so gateway models need no custom provider config.
    case "gateway":
      return "vercel-ai-gateway";
    // Pi ships OpenRouter as a built-in provider (env key OPENROUTER_API_KEY),
    // so openrouter models need no custom provider config.
    case "openrouter":
      return "openrouter";
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
