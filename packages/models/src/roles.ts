import { DECISION_ROLES } from "./decision-catalog";

/**
 * Flat Model Role -> catalog id map, merged from each operation's own roles
 * map (embedding, rerank, decision, language — see each catalog file). Every
 * ticket that owns an operation only adds its own spread member here; roles
 * must stay disjoint across maps.
 */
export const MODEL_ROLES = {
  ...DECISION_ROLES,
} as const;

export type ModelRole = keyof typeof MODEL_ROLES;
