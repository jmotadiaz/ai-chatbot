import {
  AUDIENCE_QUESTION_KEY,
  DIRECTION_QUESTION_KEY,
  DOMAIN_QUESTION_KEY,
  ENGLISH_AUDIENCE_QUESTION,
  ENGLISH_DIRECTION_QUESTION,
  ENGLISH_DOMAIN_QUESTION,
} from "./questions";
import {
  resolveTextClassifications,
  resolveTranslationClassifications,
  type TextClassifications,
  type TranslationClassifications,
} from "./policy";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import type { DecideOptions, Decision } from "@/lib/infrastructure/ai/types";

/** Trace name grouping English Helper classification calls in the Gateway's observability. */
export const ENGLISH_CLASSIFIER_TRACE_NAME = "english-helper";

/**
 * The English Helper's classifier: one Decisions call per workflow, asking
 * all its questions at once (translation: direction + audience + domain;
 * grammar: audience + domain), via the `decision-default` contract, so a catalog
 * change never touches this feature. The raw text travels as `state.text`.
 *
 * No confidence gate: whatever Jev decides is applied as-is. The per-question
 * fallback policy (`policy.ts`) covers call failure and missing/unknown
 * answers only — a broken classifier degrades the workflow to defaults and
 * never reaches the user as an exception.
 *
 * There is no injected decision function: the feature calls the shared
 * inference infrastructure (`inferenceKit.decide`) and tests substitute the
 * Model Gateway at its HTTP seam (ADR 0013).
 */
const ask = async (
  text: string,
  questions: DecideOptions["questions"],
): Promise<Decision | null> => {
  try {
    return await inferenceKit.decide({
      // The single Default Model Contract for decisions (spec §2.4).
      model: "decision-default",
      questions,
      state: { text },
      scope: { traceName: ENGLISH_CLASSIFIER_TRACE_NAME },
    });
  } catch (error) {
    console.error("English classification failed:", error);
    return null;
  }
};

export async function classifyForTranslation(
  text: string,
): Promise<TranslationClassifications> {
  return resolveTranslationClassifications(
    await ask(text, {
      [DIRECTION_QUESTION_KEY]: ENGLISH_DIRECTION_QUESTION,
      [AUDIENCE_QUESTION_KEY]: ENGLISH_AUDIENCE_QUESTION,
      [DOMAIN_QUESTION_KEY]: ENGLISH_DOMAIN_QUESTION,
    }),
  );
}

export async function classifyForGrammar(
  text: string,
): Promise<TextClassifications> {
  return resolveTextClassifications(
    await ask(text, {
      [AUDIENCE_QUESTION_KEY]: ENGLISH_AUDIENCE_QUESTION,
      [DOMAIN_QUESTION_KEY]: ENGLISH_DOMAIN_QUESTION,
    }),
  );
}
