import { MODEL_CATALOG, type ModelCatalogEntry } from "./catalog";
import { PI_PROVIDER } from "./mapping";

export interface PiModelDefinition {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  contextWindow?: number;
  maxTokens?: number;
}

export interface PiModelsJson {
  providers: Record<string, { models: PiModelDefinition[] }>;
}

export function generateModelsJson(
  catalog: readonly ModelCatalogEntry[] = MODEL_CATALOG,
): PiModelsJson {
  const models: PiModelDefinition[] = catalog
    .filter((e) => e.userInvocable)
    .map((e) => ({
      id: e.provider.modelId,
      name: e.id,
      reasoning: e.reasoning ?? false,
      input: [
        "text" as const,
        ...(e.supportedFiles?.includes("img") ? (["image" as const] as const) : []),
      ],
      ...(e.contextWindow !== undefined && { contextWindow: e.contextWindow }),
      ...(e.maxTokens !== undefined && { maxTokens: e.maxTokens }),
    }));

  return { providers: { [PI_PROVIDER]: { models } } };
}
