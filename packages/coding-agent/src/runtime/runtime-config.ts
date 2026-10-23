import { config } from "config";
import { resolveAuthJsonPath, resolveModelsJsonPath } from "./models";
import {
  resolveArtifactsBaseUrl,
  resolveArtifactsDir,
  resolveCodingAgentDir,
  resolveProjectsRoot,
  resolveSessionsDir,
  resolveWorkerPort,
} from "./paths";
import { resolvePiPackagesDir } from "./pi-packages";
import { getWorkerRuntimeConfig } from "./runtime-overrides";

/**
 * Credential/location config of the Model Gateway integration (ADR 0011 §6).
 *
 * Every field is optional so callers can inject only what they override: the
 * defaults live in the composition root (`resolveGatewayRuntimeConfig`), never
 * in `process.env`. An explicit empty string (`apiKey: ""`) is honoured as
 * "unset" for the credentials, which is how a test asserts the fail-fast
 * validation without touching the environment.
 */
export interface GatewayRuntimeConfig {
  gatewayUrl?: string;
  apiKey?: string;
  modelsJsonPath?: string;
  authJsonPath?: string;
}

/** Full worker config: Gateway config + the Pi runtime directories and port. */
export interface WorkerRuntimeConfig extends GatewayRuntimeConfig {
  projectsRoot?: string;
  sessionsDir?: string;
  agentDir?: string;
  piPackagesDir?: string;
  artifactsDir?: string;
  artifactsBaseUrl?: string;
  workerPort?: number;
}

/**
 * Composition root of the Gateway config: explicit overrides win, then the
 * process-wide config registered by `startHttpTransport()`, then the active
 * Entorno bundle. Path defaults reuse the resolvers of `paths.ts`/`models.ts`,
 * so a relative override still anchors to this package and an empty string is
 * still treated as unset.
 */
export function resolveGatewayRuntimeConfig(
  overrides: GatewayRuntimeConfig = {},
): Required<GatewayRuntimeConfig> {
  const base = { ...getWorkerRuntimeConfig(), ...overrides };
  return {
    // `??` (not the empty-string-aware picker): an explicit `apiKey: ""` must
    // reach `ensureGatewayModelsJson`'s validation instead of silently falling
    // back to the bundle.
    gatewayUrl: base.gatewayUrl ?? config.modelGatewayUrl(),
    apiKey: base.apiKey ?? config.modelGatewayApiKey(),
    modelsJsonPath: resolveModelsJsonPath(base),
    authJsonPath: resolveAuthJsonPath(base),
  };
}

/**
 * Composition root of the worker config. `transports/http.ts` builds it with
 * `defaultWorkerRuntimeConfig()`; tests build it with
 * `createTestWorkerContext().workerConfig`. Everything downstream (SessionRegistry,
 * SessionManager, runtime-factory, gateway-catalog) receives the resolved
 * values instead of reading `config.*` itself.
 */
export function resolveWorkerRuntimeConfig(
  overrides: WorkerRuntimeConfig = {},
): Required<WorkerRuntimeConfig> {
  const base = { ...getWorkerRuntimeConfig(), ...overrides };
  return {
    ...resolveGatewayRuntimeConfig(base),
    projectsRoot: resolveProjectsRoot(base),
    sessionsDir: resolveSessionsDir(base),
    agentDir: resolveCodingAgentDir(base),
    piPackagesDir: resolvePiPackagesDir(base),
    artifactsDir: resolveArtifactsDir(base),
    artifactsBaseUrl: resolveArtifactsBaseUrl(base),
    workerPort: resolveWorkerPort(base),
  };
}

/**
 * The worker HTTP transport's default config (active Entorno bundle, plus any
 * process-wide overrides already registered). Exported so `transports/http.ts`
 * can build the composition root without knowing where the defaults live.
 */
export function defaultWorkerRuntimeConfig(): Required<WorkerRuntimeConfig> {
  return resolveWorkerRuntimeConfig();
}
