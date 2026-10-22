import { repoPath, packagePath, homePath } from "./paths";
import type { StructuralConfig } from "./types";

/**
 * Configuración estructural de PRODUCCIÓN (versionada, sin secretos).
 *
 * Continuidad de Producción (ADR 0002): `codingAgentSessionsDir` y
 * `codingAgentProjectsRoot` conservan EXACTAMENTE los valores vigentes del
 * servicio bajo pm2; el resto de rutas se expresan de forma portable vía
 * `repoPath`/`packagePath`.
 */
export const configProd = {
  entorno: "prod",
  port: 8085,
  modelGatewayUrl: "http://127.0.0.1:4000",
  codingAgentEnabled: true,
  // El servicio vivo lista los proyectos bajo el directorio padre del monorepo
  // (`/home/javier/projects`), no dentro de él. `repoPath("..")` preserva ese
  // valor sin hardcodear el home del host.
  codingAgentProjectsRoot: repoPath(".."),
  // Literal histórico de Producción (ADR 0002): las sesiones Pi ya están
  // agrupadas bajo ese path y cambiar la ruta perdería el historial visible.
  codingAgentSessionsDir: homePath("coding-agent", "sessions"),
  codingAgentWorkerUrl: "http://localhost:3015",
  codingAgentWorkerPort: 3015,
  codingAgentAuthJson: packagePath("coding-agent", ".pi-prod/auth.json"),
  codingAgentModelsJson: packagePath("coding-agent", ".pi-prod/models.json"),
  codingAgentAgentDir: packagePath("coding-agent", ".pi-prod/agent"),
  codingAgentPiPackagesDir: packagePath("coding-agent", ".pi-prod/packages"),
  codingAgentArtifactsDir: packagePath("coding-agent", ".pi-prod/artifacts"),
  // Lo sigue el NAVEGADOR del usuario: debe ser alcanzable en la LAN, no en
  // loopback. Mismo valor vigente en `.env.prod`.
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
