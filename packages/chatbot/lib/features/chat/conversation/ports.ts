import type { ModelConfiguration } from "@/lib/features/foundation-model/types";

export interface ChatAgentAiPort {
  getRagModelConfiguration(): ModelConfiguration;
  getWebSearchModelConfiguration(): ModelConfiguration;
  getContext7ModelConfiguration(): ModelConfiguration;
  getProjectModelConfiguration(): ModelConfiguration;
}
