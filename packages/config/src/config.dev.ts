import { repoPath, packagePath } from "./paths";
import type { StructuralConfig } from "./types";

/**
 * DEVELOPMENT structural configuration (versioned, no secrets).
 *
 * Pi runtime isolated under `.pi-dev/*` (ADR 0002 v2). Dev keeps the same
 * `codingAgentProjectsRoot` as Production (the monorepo's parent directory),
 * which is where the projects the agent works with live.
 */
export const configDev = {
  environment: "dev",
  port: 3000,
  modelGatewayUrl: "http://127.0.0.1:4000",
  codingAgentEnabled: true,
  codingAgentProjectsRoot: repoPath(".."),
  codingAgentSessionsDir: packagePath("coding-agent", ".pi-dev/sessions"),
  codingAgentWorkerUrl: "http://localhost:3016",
  codingAgentWorkerPort: 3016,
  codingAgentAuthJson: packagePath("coding-agent", ".pi-dev/auth.json"),
  codingAgentModelsJson: packagePath("coding-agent", ".pi-dev/models.json"),
  codingAgentAgentDir: packagePath("coding-agent", ".pi-dev/agent"),
  codingAgentPiPackagesDir: packagePath("coding-agent", ".pi-dev/packages"),
  codingAgentArtifactsDir: packagePath("coding-agent", ".pi-dev/artifacts"),
  // Base of the links the agent publishes; the user's browser follows it.
  codingAgentArtifactsUrl: "http://192.168.18.50:3016",
  contextWindow: 128000,
  ragUploadLimit: "false",
  debugChunking: true,
  disableDevIndicator: false,
  otelEnabled: false,
  authTrustHost: true,
  serverOutput: false,
  privateBehavior: "enabled",
  traceEnabled: true,
  traceRaw: true,
  traceDir: packagePath("coding-agent", ".pi-dev/traces"),
  nextBuildDir: ".next",
} satisfies StructuralConfig;
