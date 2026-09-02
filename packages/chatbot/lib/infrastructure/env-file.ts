import path from "node:path";
import { fileURLToPath } from "node:url";

const getRepoRoot = (): string => {
  if (typeof fileURLToPath === "function" && import.meta?.url) {
    // packages/chatbot/lib/infrastructure/env-file.ts → cuatro niveles arriba
    // (infrastructure, lib, chatbot, packages) = raíz del repo.
    return path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../..",
    );
  }
  return "";
};

/**
 * Fichero de entorno del Entorno activo, anclado a la raíz del repo (no al cwd,
 * que varía entre scripts, playwright y test runners). Mapea por
 * `NEXT_PUBLIC_ENV`: test→`.env.test`, evals→`.env.evals`, dev→`.env.dev`,
 * prod→`.env.prod`. Sin valor (o valor desconocido) → `.env.dev`: el Entorno
 * local por defecto. Ya no existe fallback a `.env.development.local`.
 *
 * Server-only: usa `node:path`/`node:url` (webpack del cliente no resuelve el
 * scheme `node:`); los flags de modo viven en `env.ts`.
 */
export const resolveEnvFile = (): string => {
  const repoRoot = getRepoRoot();
  const env = process.env.NEXT_PUBLIC_ENV;
  if (env === "test") return path.join(repoRoot, ".env.test");
  if (env === "evals") return path.join(repoRoot, ".env.evals");
  if (env === "prod") return path.join(repoRoot, ".env.prod");
  return path.join(repoRoot, ".env.dev");
};
