import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { resolveOverride } from "./paths";

export function getModelsJsonPath(): string {
  return resolveOverride(
    process.env.CODING_AGENT_MODELS_JSON,
    path.join(getAgentDir(), "models.json"),
  );
}

export function getAuthJsonPath(): string {
  return resolveOverride(
    process.env.CODING_AGENT_AUTH_JSON,
    path.join(getAgentDir(), "auth.json"),
  );
}
