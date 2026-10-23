import { repoPath, packagePath } from "./paths";
import type { StructuralConfig } from "./types";

/**
 * TEST structural configuration (versioned, no secrets).
 *
 * Pi runtime isolated under `.pi-test/*` (ADR 0002 v2) and Model Gateway mock
 * on `:4001` (ADR 0010). The Playwright webServer serves the chatbot on
 * `:3001`; the Vitest tests do not open a port.
 */
export const configTest = {
  environment: "test",
  port: 3001,
  modelGatewayUrl: "http://127.0.0.1:4001",
  codingAgentEnabled: true,
  codingAgentProjectsRoot: repoPath("coding-agent-projects"),
  codingAgentSessionsDir: packagePath("coding-agent", ".pi-test/sessions"),
  // In test the chatbot does NOT talk to the real worker: it uses the HTTP stub.
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
