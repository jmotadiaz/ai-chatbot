import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

// The Playwright web server forwards these as empty strings when unset, so an
// empty value has to mean "use the default" rather than "use the empty path".
export function getModelsJsonPath(): string {
  return process.env.CODING_AGENT_MODELS_JSON || path.join(getAgentDir(), "models.json");
}

export function getAuthJsonPath(): string {
  return process.env.CODING_AGENT_AUTH_JSON || path.join(getAgentDir(), "auth.json");
}
