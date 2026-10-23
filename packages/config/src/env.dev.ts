import { configDev } from "./config.dev";
import { createConfigFacade } from "./facade";
import { validateAppConfig } from "./guardrails";
import { secretsDev } from "./secrets.dev";
import type { AppConfig } from "./types";

// The bundler alias `"config"` points at THIS module: it re-exports the
// package's full isomorphic surface in addition to the Environment facade.
export * from "./surface";

/**
 * DEVELOPMENT static bundle: `config.dev` + `secrets.dev`, validated by the
 * coherence guardrails and frozen.
 *
 * It is the module to which the Next.js bundler redirects the `"config"` import
 * when the active Environment is dev (`next.config.ts` → `resolveAlias`), and the
 * one `config.ts` selects for the worker and the CLI scripts with
 * `--env=dev`.
 */
export const envDev: AppConfig = Object.freeze(
  validateAppConfig({ ...configDev, ...secretsDev }),
);

// The bundler (Next.js) alias and the test runners resolve this module: it
// must export the SAME `config` facade as the selector so the call sites do
// not change (ADR 0011 §4.2).
export const config = createConfigFacade(() => envDev);
