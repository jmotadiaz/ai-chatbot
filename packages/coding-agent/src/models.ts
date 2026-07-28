import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export function getModelsJsonPath(): string {
  return process.env.CODING_AGENT_MODELS_JSON ?? path.join(getAgentDir(), "models.json");
}
