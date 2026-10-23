import path from "node:path";
import { config } from "config";
import { pickOverride, resolveCodingAgentDir, resolveOverride } from "./paths";
import { getWorkerRuntimeConfig } from "./runtime-overrides";
import type { WorkerRuntimeConfig } from "./runtime-config";

/**
 * Pi `models.json` location (the single `model-gateway` provider written by
 * `syncGatewayModelsFile`). DI precedence: explicit override → process-wide
 * worker config → Environment bundle → `<agent dir>/models.json`.
 */
export function resolveModelsJsonPath(
  cfg?: Pick<WorkerRuntimeConfig, "modelsJsonPath" | "agentDir">,
): string {
  const ambient = getWorkerRuntimeConfig();
  const agentDir = pickOverride(cfg?.agentDir, ambient.agentDir);
  // An injected agent dir implies its models.json: a partial DI override must
  // never fall back to the Environment path (a test sandbox would leak writes into
  // the package). The Environment bundle only answers when neither path nor dir
  // was injected.
  const derived = agentDir ? path.join(resolveCodingAgentDir(cfg), "models.json") : undefined;
  return resolveOverride(
    pickOverride(
      cfg?.modelsJsonPath,
      ambient.modelsJsonPath,
      derived,
      config.codingAgentModelsJson(),
    ),
    path.join(resolveCodingAgentDir({}), "models.json"),
  );
}

export function getModelsJsonPath(): string {
  return resolveModelsJsonPath(getWorkerRuntimeConfig());
}

/**
 * Per-Environment auth.json (ADR 0002 v2). Relative overrides anchor to the
 * package; the fallback is the worker-owned agent dir, never the global
 * `~/.pi/agent/auth.json`, so environments cannot leak credentials into each
 * other.
 */
export function resolveAuthJsonPath(
  cfg?: Pick<WorkerRuntimeConfig, "authJsonPath" | "agentDir">,
): string {
  const ambient = getWorkerRuntimeConfig();
  const agentDir = pickOverride(cfg?.agentDir, ambient.agentDir);
  // Same rule as models.json: an injected agent dir owns its auth.json.
  const derived = agentDir ? path.join(resolveCodingAgentDir(cfg), "auth.json") : undefined;
  return resolveOverride(
    pickOverride(
      cfg?.authJsonPath,
      ambient.authJsonPath,
      derived,
      config.codingAgentAuthJson(),
    ),
    path.join(resolveCodingAgentDir({}), "auth.json"),
  );
}

export function getAuthJsonPath(): string {
  return resolveAuthJsonPath(getWorkerRuntimeConfig());
}
