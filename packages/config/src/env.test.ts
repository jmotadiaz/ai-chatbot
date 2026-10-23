import { configTest } from "./config.test";
import { createConfigFacade } from "./facade";
import { validateAppConfig } from "./guardrails";
import { secretsTest } from "./secrets.test";
import type { AppConfig } from "./types";

// The bundler alias `"config"` points at THIS module: it re-exports the
// package's full isomorphic surface in addition to the Environment facade.
export * from "./surface";

/**
 * TEST static bundle: `config.test` + `secrets.test`, validated by the
 * coherence guardrails and frozen.
 *
 * It is the module to which the Next.js bundler redirects the `"config"` import
 * when the active Environment is test (`next.config.ts` → `resolveAlias`), the
 * one the `resolve.alias` entries of `vitest.config.ts` (chatbot and coding-agent)
 * point at, and the one `config.ts` selects for the CLI scripts with `--env=test`.
 */
export const envTest: AppConfig = Object.freeze(
  validateAppConfig({ ...configTest, ...secretsTest }),
);

// The bundler (Next.js) alias and the test runners resolve this module: it
// must export the SAME `config` facade as the selector so the call sites do
// not change (ADR 0011 §4.2).
export const config = createConfigFacade(() => envTest);
