import type { ModelConfiguration } from "@/lib/features/foundation-model/types";
import type {
  LANGUAGE_MODEL_CONFIGURATIONS_CONST,
  LanguageModelKeys,
} from "@/lib/features/foundation-model/config";
import type { MOCK_MODELS } from "./registry";

type MockConfigKeys = keyof typeof MOCK_MODELS;

declare module "@/lib/features/foundation-model/config" {
  export type LanguageModelKeysWithMocks = LanguageModelKeys | MockConfigKeys;
  export type LanguageModelConfigurationWithMocks =
    (typeof LANGUAGE_MODEL_CONFIGURATIONS_CONST) &
      Record<MockConfigKeys, ModelConfiguration>;
}
