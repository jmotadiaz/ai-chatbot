import { repoPath, packagePath } from "./paths";
import type { StructuralConfig } from "./types";

/**
 * Configuración estructural de DESARROLLO (versionada, sin secretos).
 *
 * Runtime Pi aislado en `.pi-dev/*` (ADR 0002 v2). Dev conserva el mismo
 * `codingAgentProjectsRoot` que Producción (el directorio padre del monorepo),
 * que es donde viven los proyectos con los que trabaja el agente.
 */
export const configDev = {
  entorno: "dev",
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
  // Base de los enlaces que el agente publica; el navegador del usuario la sigue.
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
