import path from "node:path";
import { config } from "config";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getCodingAgentDir, resolveOverride } from "./paths";

export function getModelsJsonPath(): string {
  return resolveOverride(
    config.codingAgentModelsJson(),
    path.join(getCodingAgentDir(), "models.json"),
  );
}

export function getAuthJsonPath(): string {
  return resolveOverride(
    config.codingAgentAuthJson(),
    path.join(getAgentDir(), "auth.json"),
  );
}
