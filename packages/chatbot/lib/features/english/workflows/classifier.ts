import type { DecideOptions, Decision } from "inference";
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

/** Trace name grouping English Helper classification calls in OpenRouter's observability. */
export const ENGLISH_CLASSIFIER_TRACE_NAME = "english-helper";

export type DecideFn = (options: DecideOptions) => Promise<Decision>;

/**
 * The English Helper's classifier: one Decisions call per workflow, asking
 * all its questions at once (translation: direction + audience + domain;
 * grammar: audience + domain), by `Model Role` so a catalog change never
 * touches this feature. The raw text travels as `state.text`.
 *
 * No confidence gate: whatever Jev decides is applied as-is. The per-question
 * fallback policy (`policy.ts`) covers call failure and missing/unknown
 * answers only — a broken classifier degrades the workflow to defaults and
 * never reaches the user as an exception.
 */
export interface EnglishClassifier {
  classifyForTranslation(text: string): Promise<TranslationClassifications>;
  classifyForGrammar(text: string): Promise<TextClassifications>;
}

export const createEnglishClassifier = (
  decide: DecideFn,
): EnglishClassifier => {
  const ask = async (
    text: string,
    questions: DecideOptions["questions"],
  ): Promise<Decision | null> => {
    try {
      return await decide({
        model: "englishHelper",
        questions,
        state: { text },
        scope: { traceName: ENGLISH_CLASSIFIER_TRACE_NAME },
      });
    } catch (error) {
      console.error("English classification failed:", error);
      return null;
    }
  };

  return {
    async classifyForTranslation(text) {
      return resolveTranslationClassifications(
        await ask(text, {
          [DIRECTION_QUESTION_KEY]: ENGLISH_DIRECTION_QUESTION,
          [AUDIENCE_QUESTION_KEY]: ENGLISH_AUDIENCE_QUESTION,
          [DOMAIN_QUESTION_KEY]: ENGLISH_DOMAIN_QUESTION,
        }),
      );
    },

    async classifyForGrammar(text) {
      return resolveTextClassifications(
        await ask(text, {
          [AUDIENCE_QUESTION_KEY]: ENGLISH_AUDIENCE_QUESTION,
          [DOMAIN_QUESTION_KEY]: ENGLISH_DOMAIN_QUESTION,
        }),
      );
    },
  };
};
