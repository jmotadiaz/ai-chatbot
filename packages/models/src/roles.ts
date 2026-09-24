import { LANGUAGE_MODEL_ROLES } from "./language-roles";
import { SPEECH_ROLES } from "./speech-catalog";

/**
 * Flat union of every Model Role across every operation. Each ticket owns
 * one map (language, embedding, rerank, decision, speech) and adds only its
 * own spread member here; mergers resolve this file by union (see
 * `09-orchestrator-decisions.md`). Roles must stay disjoint across maps —
 * `roles.test.ts` asserts that at runtime as more maps join this spread.
 */
export const MODEL_ROLES = {
  ...LANGUAGE_MODEL_ROLES,
  ...SPEECH_ROLES,
} as const;

export type ModelRole = keyof typeof MODEL_ROLES;
