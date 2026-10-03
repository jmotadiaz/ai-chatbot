import type { InvocableModelId } from "models";
import {
  MOCK_MID_STREAM_ERROR,
  MOCK_REASONING,
  MOCK_REFUSAL,
  MOCK_TOOL_EXECUTION,
  MOCK_VISION,
  type MockModelEntry,
} from "inference/testing";

/**
 * What an alias's mock behaviour assumes about the Model Catalog entry its
 * `id` resolves to. Checked against MODEL_CATALOG by the alias-invariants
 * test (tests/unit/mocks/ai/capabilities.test.ts), so a catalog edit that
 * breaks one of these assumptions fails loudly — naming the alias and the
 * unmet property — instead of breaking e2e silently.
 */
export interface AliasRequirements {
  /** `supportedFiles` must include "img" (the mock returns a file part). */
  imageInput?: true;
  /** `reasoning` must be `true` (the mock returns a reasoning part). */
  reasoning?: true;
  /**
   * `temperature` must differ from the named alias's `temperature`
   * (settings.spec switches between the two models and asserts the
   * temperature input actually changes value). Typed as a plain `string`
   * (not `CapabilityAlias`) on purpose: `CapabilityAlias` is derived from
   * `CAPABILITY_ALIASES` below, and `CAPABILITY_ALIASES` is itself typed
   * against `AliasRequirements` via `satisfies` — referencing `CapabilityAlias`
   * here would make that a circular type. The alias-invariants test
   * (tests/unit/mocks/ai/capabilities.test.ts) is what actually checks the
   * referenced alias exists.
   */
  distinctTemperatureFrom?: string;
  /**
   * No behaviour is registered for this alias in ALIAS_BEHAVIOURS: it must
   * resolve through the generic createMockModel, not a specialised one.
   */
  plainMock?: true;
}

/**
 * Identity helper that widens each alias's `requires` literal to the full
 * `AliasRequirements` shape. Needed because a function call's return type is
 * not narrowed by the `as const` on `CAPABILITY_ALIASES` below: without it,
 * each alias's `requires` would keep its own narrowest literal type (e.g.
 * `{ readonly plainMock: true }` for one alias, `{}` for another), and
 * indexing by a union `CapabilityAlias` key would then see `.requires` as a
 * union of those mismatched shapes — so e.g. `.imageInput` would fail to
 * type-check on the branches that never declared it.
 */
const req = (requires: AliasRequirements): AliasRequirements => requires;

/**
 * Binds each alias the e2e suite needs to a selectable chat model, and
 * declares what its mock behaviour assumes about that model's catalog
 * entry. This is the only place a mock is tied to a model id; the
 * `satisfies` below is what catches a model leaving the catalog.
 */
export const CAPABILITY_ALIASES = {
  // basicChat must stay plainMock so it gets the generic mock, and its
  // declared temperature has to differ from alwaysRefuses' — settings.spec
  // switches between the two to check per-model settings.
  basicChat: { id: "Kimi K3", requires: req({ plainMock: true }) },
  // A second plain model: the hub runs without tools, so its multi-panel
  // test needs two models that just answer.
  basicChatAlt: { id: "GLM 5.3", requires: req({ plainMock: true }) },
  canExecuteTools: { id: "Deepseek v4.1 Flash", requires: req({}) },
  canSeeImages: { id: "Qwen 3.8 Flash", requires: req({ imageInput: true }) },
  canProduceReasoning: {
    id: "Muse Spark 1.3",
    requires: req({ reasoning: true }),
  },
  // settings.spec asserts a temperature of 1 here.
  alwaysRefuses: {
    id: "MiniMax M3",
    requires: req({ distinctTemperatureFrom: "basicChat" }),
  },
  failsMidStream: { id: "Hy3", requires: req({}) },
} as const satisfies Record<string, { id: InvocableModelId; requires: AliasRequirements }>;

export type CapabilityAlias = keyof typeof CAPABILITY_ALIASES;

/**
 * Behaviour bound to each alias that needs one, keyed by alias rather than
 * by catalog id (the id-keyed registry this replaced lived in `inference`
 * before its model-id-free mock constructors moved to `inference/testing`).
 * Aliases absent here — the `plainMock` ones — fall back to the generic
 * `createMockModel` in the chatbot's test composition root.
 */
export const ALIAS_BEHAVIOURS: Partial<Record<CapabilityAlias, MockModelEntry>> = {
  canExecuteTools: MOCK_TOOL_EXECUTION,
  canSeeImages: MOCK_VISION,
  canProduceReasoning: MOCK_REASONING,
  alwaysRefuses: MOCK_REFUSAL,
  failsMidStream: MOCK_MID_STREAM_ERROR,
};
