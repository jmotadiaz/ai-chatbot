import { configProd } from "./config.prod";
import { resolveDotenvSecrets } from "./dotenv";
import { createConfigFacade } from "./facade";
import { createEnvironmentBundle } from "./guardrails";
import type { AppConfig } from "./types";

// The bundler alias `"config"` points at THIS module: it re-exports the
// package's full isomorphic surface in addition to the Environment facade.
export * from "./surface";

/**
 * PRODUCTION bundle: structural configuration validated eagerly, secrets resolved
 * lazily from `<REPO_ROOT>/.env` via in-memory parsing (ADR 0014).
 *
 * It is the module to which the Next.js bundler redirects the `"config"` import
 * when the active Environment is prod (`next.config.ts` → `resolveAlias`), and
 * the one `config.ts` selects for the worker and the CLI scripts with
 * `--env=prod`.
 */
export const envProd: AppConfig = createEnvironmentBundle(
  configProd,
  () => resolveDotenvSecrets("prod"),
);

// The bundler (Next.js) alias and the test runners resolve this module: it
// must export the SAME `config` facade as the selector so the call sites do
// not change (ADR 0011 §4.2).
export const config = createConfigFacade(() => envProd);
