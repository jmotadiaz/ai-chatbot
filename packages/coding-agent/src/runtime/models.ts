import path from "node:path";
import { config } from "config";
import { getCodingAgentDir, resolveOverride } from "./paths";

export function getModelsJsonPath(): string {
  return resolveOverride(
    config.codingAgentModelsJson(),
    path.join(getCodingAgentDir(), "models.json"),
  );
}

/**
 * Per-Entorno auth.json (ADR 0002 v2). Relative overrides anchor to the
 * package; the fallback is the worker-owned agent dir, never the global
 * `~/.pi/agent/auth.json`, so environments cannot leak credentials into each
 * other.
 */
export function getAuthJsonPath(): string {
  return resolveOverride(
    config.codingAgentAuthJson(),
    path.join(getCodingAgentDir(), "auth.json"),
  );
}
