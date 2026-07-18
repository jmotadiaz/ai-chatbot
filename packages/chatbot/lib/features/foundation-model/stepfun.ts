import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const STEPFUN_CONFIG = {
  "StepFun 3.5": {
    model: providers.openrouter("stepfun/step-3.5-flash:free"),
    company: "stepfun",
  },
} as const satisfies Record<string, ModelConfiguration>;
