import { repoPath, packagePath, homePath } from "./paths";
import type { StructuralConfig } from "./types";

/**
 * PRODUCTION structural configuration (versioned, no secrets).
 *
 * Production continuity (ADR 0002): `codingAgentSessionsDir` and
 * `codingAgentProjectsRoot` keep EXACTLY the values in force in the service
 * under pm2; the rest of the paths are expressed portably via
 * `repoPath`/`packagePath`.
 */
export const configProd = {
  environment: "prod",
  port: 8085,
  modelGatewayUrl: "http://127.0.0.1:4000",
  codingAgentEnabled: true,
  // The live service lists the projects under the monorepo's parent directory
  // (`/home/javier/projects`), not inside it. `repoPath("..")` preserves that
  // value without hardcoding the host's home.
  codingAgentProjectsRoot: repoPath(".."),
  // Historical Production literal (ADR 0002): the Pi sessions are already
  // grouped under that path and changing the route would lose the visible history.
  codingAgentSessionsDir: homePath("coding-agent", "sessions"),
  codingAgentWorkerUrl: "http://localhost:3015",
  codingAgentWorkerPort: 3015,
  codingAgentAuthJson: packagePath("coding-agent", ".pi-prod/auth.json"),
  codingAgentModelsJson: packagePath("coding-agent", ".pi-prod/models.json"),
  codingAgentAgentDir: packagePath("coding-agent", ".pi-prod/agent"),
  codingAgentPiPackagesDir: packagePath("coding-agent", ".pi-prod/packages"),
  codingAgentArtifactsDir: packagePath("coding-agent", ".pi-prod/artifacts"),
  // Followed by the user's BROWSER: it must be reachable on the LAN, not on
  // loopback. Same value in force in `.env.prod`.
  codingAgentArtifactsUrl: "http://192.168.18.50:3015",
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
  traceDir: packagePath("coding-agent", ".pi-prod/traces"),
  nextBuildDir: ".next",
} satisfies StructuralConfig;
