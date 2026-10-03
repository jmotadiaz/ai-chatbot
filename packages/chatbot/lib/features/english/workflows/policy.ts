import type { Decision } from "inference";
import {
  AUDIENCE_OPTIONS,
  AUDIENCE_QUESTION_KEY,
  DIRECTION_OPTIONS,
  DIRECTION_QUESTION_KEY,
  DOMAIN_OPTIONS,
  DOMAIN_QUESTION_KEY,
  type AudienceOption,
  type DirectionOption,
  type DomainOption,
} from "./questions";

/**
 * Per-question fallbacks, applied only when the classification call fails
 * (timeout/transport error) or an answer is missing/unknown — never on low
 * confidence. There is no confidence gate: whatever Jev decides is applied
 * as-is (same policy the Chat Mode Router uses).
 *
 * - direction → `es-to-en` (today's "default to English (UK) target" rule).
 * - audience → `general`.
 * - domain → `none`, which removes the domain block from the prompt entirely.
 */
export const FALLBACK_DIRECTION: DirectionOption = "es-to-en";
export const FALLBACK_AUDIENCE: AudienceOption = "general";
export const FALLBACK_DOMAIN: DomainOption = "none";

/** One answered question as recorded for observability — provenance only, never a gate. */
export interface ClassificationAnswerProvenance {
  choice: string;
  confidence?: number;
  probabilities?: Record<string, number>;
}

/**
 * Everything needed to audit one classification call later: the model that
 * produced it plus the raw per-question answers. `modelId: "unavailable"`
 * marks a call that failed entirely and fell back to defaults.
 */
export interface ClassificationProvenance {
  modelId: string;
  provider?: string;
  latencyMs?: number;
  costUsd?: number;
  answers: Record<string, ClassificationAnswerProvenance>;
}

/** Classifications shared by both English Helper workflows. */
export interface TextClassifications {
  audience: AudienceOption;
  /** `none` means "no domain block in the prompt". */
  domain: DomainOption;
  provenance: ClassificationProvenance;
}

/** Translation additionally resolves the Direction. */
export interface TranslationClassifications extends TextClassifications {
  direction: DirectionOption;
}

const answerChoice = (
  decision: Decision | null,
  questionKey: string,
): string | undefined => decision?.answers[questionKey]?.choice;

/**
 * Keeps the classifier's choice when it is one of the question's own option
 * keys; an unknown key the provider might echo back (or a missing answer)
 * becomes that question's fallback instead of leaking into the prompt.
 */
const pickOption = <OPTION extends string>(
  options: readonly OPTION[],
  choice: string | undefined,
  fallback: OPTION,
): OPTION =>
  choice !== undefined && (options as readonly string[]).includes(choice)
    ? (choice as OPTION)
    : fallback;

const provenanceOf = (decision: Decision | null): ClassificationProvenance =>
  decision
    ? {
        modelId: decision.modelId,
        provider: decision.provider,
        latencyMs: decision.latencyMs,
        costUsd: decision.costUsd,
        answers: decision.answers,
      }
    : { modelId: "unavailable", answers: {} };

/** Total: resolves the shared classifications of both workflows, fallback per question. */
export const resolveTextClassifications = (
  decision: Decision | null,
): TextClassifications => ({
  audience: pickOption(
    AUDIENCE_OPTIONS,
    answerChoice(decision, AUDIENCE_QUESTION_KEY),
    FALLBACK_AUDIENCE,
  ),
  domain: pickOption(
    DOMAIN_OPTIONS,
    answerChoice(decision, DOMAIN_QUESTION_KEY),
    FALLBACK_DOMAIN,
  ),
  provenance: provenanceOf(decision),
});

/** Total: `resolveTextClassifications` plus the Direction. */
export const resolveTranslationClassifications = (
  decision: Decision | null,
): TranslationClassifications => ({
  ...resolveTextClassifications(decision),
  direction: pickOption(
    DIRECTION_OPTIONS,
    answerChoice(decision, DIRECTION_QUESTION_KEY),
    FALLBACK_DIRECTION,
  ),
});
