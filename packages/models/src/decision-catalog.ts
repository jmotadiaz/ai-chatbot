/**
 * Decision endpoint kind: the OpenRouter Decisions API (`alpha.decisions`),
 * not a chat-completions endpoint. Kept separate from `ProviderKind` (see
 * `catalog.ts`) on purpose — a decision model has no language-model call
 * shape, so it must not force a language-model client to exist for it.
 */
export type DecisionProviderKind = "openrouterDecisions";

/**
 * Catalog entry for a Decisions-API model. Deliberately its own shape (not
 * `ModelCatalogEntry`): no temperature/contextWindow/cost — those are
 * language-model concepts this endpoint kind does not have.
 */
export interface DecisionModelCatalogEntry {
  id: string;
  provider: { kind: DecisionProviderKind; modelId: string };
}

export const DECISION_MODELS = [
  {
    // Jev 1.13 (TypeSafe System One) is only reachable through OpenRouter's
    // Decisions API (alpha), never as a chat-completions model — hence its
    // own endpoint kind instead of a `ProviderKind` entry. `provider.modelId`
    // is the alias requested; the API echoes back a dated id
    // (`typesafe/jev-1.13-YYYYMMDD`), which is what callers see as the
    // `Decision.modelId` provenance field on the response, not this alias.
    id: "Jev 1.13",
    provider: { kind: "openrouterDecisions", modelId: "typesafe/jev-1.13" },
  },
] as const satisfies readonly DecisionModelCatalogEntry[];

export type DecisionModelId = (typeof DECISION_MODELS)[number]["id"];

/**
 * Model Role -> Decision catalog id, for the internal (non-selectable)
 * decisions features ask for by role instead of a literal catalog id.
 */
export const DECISION_ROLES = {
  chatModeRouter: "Jev 1.13",
  /**
   * `lib/features/english/workflows/classifier.ts` — the English Helper's
   * classification trio (direction, audience, domain) asked in one call.
   */
  englishHelper: "Jev 1.13",
} as const satisfies Record<string, DecisionModelId>;

export type DecisionRole = keyof typeof DECISION_ROLES;
