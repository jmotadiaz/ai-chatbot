#!/usr/bin/env tsx
import { config, parseBuildFlagsFromArgv, setBuildFlags } from "config";

/**
 * `build:prod` gate of the worker (ticket 07; same contract as the chatbot's
 * gate). `build:prod` writes prod's `dist/` and regenerates
 * `.pi-prod/models.json` (input for the next startup), so it requires the
 * operator/CI's explicit opt-in. The agent's verification uses `build:verify`
 * (dist/verify + .pi-verify, isolated), which does not need it.
 *
 * Opt-in per ADR 0011: the `--allow-prod-build` flag in `process.argv` (what
 * the `config.ts` selector parses in `initConfig`). The gate needs no
 * Environment, so it sets only the build flags instead of initializing a
 * bundle. `ALLOW_PROD_BUILD=1` in the process is accepted too, as long as the
 * current `package.json` scripts (ticket 04) keep providing that opt-in from
 * the shell.
 */
setBuildFlags(parseBuildFlagsFromArgv());

const allowProdBuild =
  config.allowProdBuild() || process.env.ALLOW_PROD_BUILD === "1";

if (!allowProdBuild) {
  console.error(
    [
      "the worker build is blocked: it writes prod's dist/ and .pi-prod/models.json.",
      "If you are the operator/CI: re-run with `--allow-prod-build` in argv (or",
      "ALLOW_PROD_BUILD=1, which is what `pnpm preview` provides today).",
      "If you are the agent verifying compilation: use `pnpm --filter coding-agent build:verify`",
      "(writes to dist/verify + .pi-verify/models.json, isolated).",
      "build is forbidden — see AGENTS.md.",
    ].join("\n"),
  );
  process.exit(1);
}
