import { EMBEDDING_ROLES } from "./embedding-catalog";
import { RERANK_ROLES } from "./rerank-catalog";

/**
 * Flat union of every Model Role, role name -> catalog id, merged from each
 * operation's own role map (one map per operation catalog, owned by that
 * operation's ticket; see `embedding-catalog.ts`/`rerank-catalog.ts` and,
 * once landed, `decision-catalog.ts`/`language-roles.ts`). Roles are disjoint
 * across maps by construction — a duplicate key here is a merge conflict to
 * resolve, not a runtime concern.
 */
export const MODEL_ROLES = {
  ...EMBEDDING_ROLES,
  ...RERANK_ROLES,
} as const;

export type ModelRole = keyof typeof MODEL_ROLES;
