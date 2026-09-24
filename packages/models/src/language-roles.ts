import type { ModelId } from "./catalog";

/**
 * Model Roles for the chatbot's internal, non-selectable language-model call
 * sites: a named pointer into `MODEL_CATALOG` so retargeting the model behind
 * a role is a data edit here, not a code change in the feature that uses it.
 *
 * These are never exposed to the model picker — see `InvocableModelId` /
 * `chatModelKeys` (`packages/chatbot/lib/features/foundation-model/config.ts`)
 * for what a user can actually pick. A role's id can (and does) also be a
 * `userInvocable` catalog entry at the same time; nothing prevents a Model
 * pointed at by a role from also being selectable in the UI.
 *
 * One role can cover several call sites when they already share the same
 * model today (e.g. `metaPromptRefiner` covers all three uses in
 * `lib/features/meta-prompt/actions.ts`). Compaction needs **two** roles
 * (`compactionText` / `compactionMultimedia`) because it already picks
 * between two different models at runtime (`hasMultimedia`) — a single role
 * cannot represent that.
 *
 * `satisfies Record<string, ModelId>` is the compile-time half of "every role
 * points at an existing catalog entry"; `language-roles.test.ts` asserts the
 * same invariant at runtime and pins the id memoization behaviour.
 */
export const LANGUAGE_MODEL_ROLES = {
  /** `lib/features/chat/title.ts` — chat title generation. */
  chatTitle: "Llama 3.1 Instant",
  /** `lib/features/memory/extraction/index.ts` — fact extraction from a turn. */
  memoryExtraction: "GPT OSS Mini",
  /** `lib/features/memory/retrieval/query-decomposition.ts`. */
  memoryQueryDecomposition: "GPT OSS Mini",
  /**
   * `lib/features/web-search/utils.ts`'s `hasContextUrls`: the URL-intent
   * classifier that feeds `chat-modes/url-context-step.ts`.
   */
  webSearchUrlIntent: "Gemini 2.5 Flash Lite",
  /** `lib/features/image/actions.ts` — image editing (photo enhancement). */
  imageEdit: "Nano Banana",
  /**
   * `lib/features/meta-prompt/actions.ts` — all three uses
   * (`refineCodingAgentPrompt`/`refineChatPrompt`/`refineSystemPrompt`) share
   * this one role: they use the same model today.
   */
  metaPromptRefiner: "Deepseek v4.1 Flash",
  /**
   * `lib/features/english/workflows/index.ts` — shared by both
   * `grammarAiAdapter` and `translateAiAdapter`'s `getAudienceModelConfiguration`.
   */
  englishAudienceClassifier: "GPT OSS Mini",
  /** Same adapters' `getDomainModelConfiguration`. */
  englishDomainClassifier: "GPT OSS Mini",
  /** `translateAiAdapter.getDirectionModelConfiguration`. */
  englishDirectionDetector: "GPT OSS Mini",
  /** `grammarAiAdapter.getGrammarModelConfiguration`. */
  englishGrammarCheck: "Gemini 3.1 Flash Lite",
  /** `translateAiAdapter.getTranslateModelConfiguration`. */
  englishTranslate: "Gemini 3.1 Flash Lite",
  /**
   * `lib/features/compaction/summary-generation.ts` — the `!hasMultimedia`
   * branch of its `modelKey` ternary (`generateSummary`/`generateTurnPrefixSummary`).
   */
  compactionText: "Deepseek v4.1 Flash",
  /** Same ternary's `hasMultimedia` branch. */
  compactionMultimedia: "Qwen 3.8 Flash",
} as const satisfies Record<string, ModelId>;

export type LanguageModelRole = keyof typeof LANGUAGE_MODEL_ROLES;
