import { repoPath, packagePath } from "./paths";
import type { StructuralConfig } from "./types";

/**
 * Configuración estructural de TEST (versionada, sin secretos).
 *
 * Runtime Pi aislado en `.pi-test/*` (ADR 0002 v2) y mock del Model Gateway
 * en `:4001` (ADR 0010). El webServer de Playwright sirve el chatbot en
 * `:3001`; los tests de Vitest no abren puerto.
 */
export const configTest = {
  entorno: "test",
  port: 3001,
  modelGatewayUrl: "http://127.0.0.1:4001",
  codingAgentEnabled: true,
  codingAgentProjectsRoot: repoPath("coding-agent-projects"),
  codingAgentSessionsDir: packagePath("coding-agent", ".pi-test/sessions"),
  // En test el chatbot NO habla con el worker real: usa el stub HTTP.
  codingAgentWorkerUrl: "http://localhost:3001/api/agent/code/worker-stub",
  codingAgentWorkerPort: 3015,
  codingAgentAuthJson: packagePath("coding-agent", ".pi-test/auth.json"),
  codingAgentModelsJson: packagePath("coding-agent", ".pi-test/models.json"),
  codingAgentAgentDir: packagePath("coding-agent", ".pi-test/agent"),
  codingAgentPiPackagesDir: packagePath("coding-agent", ".pi-test/packages"),
  codingAgentArtifactsDir: packagePath("coding-agent", ".pi-test/artifacts"),
  contextWindow: 128000,
  debugChunking: false,
  disableDevIndicator: true,
  otelEnabled: false,
  authTrustHost: false,
  serverOutput: false,
  privateBehavior: "enabled",
  traceEnabled: false,
  traceRaw: false,
  traceDir: packagePath("coding-agent", ".pi-test/traces"),
  nextBuildDir: ".next",
} satisfies StructuralConfig;
