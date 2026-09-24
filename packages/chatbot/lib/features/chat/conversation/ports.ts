import type { ModelConfiguration } from "inference";

export interface ChatAgentAiPort {
  getRagModelConfiguration(): ModelConfiguration;
  getWebSearchModelConfiguration(): ModelConfiguration;
  getContext7ModelConfiguration(): ModelConfiguration;
  getProjectModelConfiguration(): ModelConfiguration;
  /** Tool-less neutral branch: same user-selected model, no tools. */
  getNeutralModelConfiguration(): ModelConfiguration;
}
