#!/usr/bin/env tsx
import {
  getBuildFlags,
  parseBuildFlagsFromArgv,
  setBuildFlags,
} from "config";

/**
 * Gate for `build:prod` (ticket 06; selector migrated to argv in ADR 0011,
 * ticket 03).
 *
 * `build` writes to the `.next` that Production serves under pm2; a distracted
 * trigger from the agent would break the running execution. That's why it requires an
 * explicit opt-in from the operator/CI:
 *
 *   - `--allow-prod-build` in process.argv — the canonical way (ADR 0011); it is
 *     used by the package.json `build` scripts (ticket 04) and by this launcher.
 *   - `ALLOW_PROD_BUILD=1` in the environment — accepted TRANSITIONALLY so as not
 *     to break the current package.json scripts (which still inject it) until
 *     ticket 04 migrates them to `--allow-prod-build`. It is the only
 *     process.env left in the gate and it does not select any Environment.
 *
 * The agent's compilation check does NOT go through here: it uses `--verify`
 * (next-cli → `.next/verify`, isolated). `build` is forbidden — see AGENTS.md.
 *
 * Output to stderr → exit 1 without opt-in; silent → exit 0 with it.
 */
const fromArgv = parseBuildFlagsFromArgv(process.argv);
setBuildFlags({
  allowProdBuild: fromArgv.allowProdBuild || process.env.ALLOW_PROD_BUILD === "1",
});

if (!getBuildFlags().allowProdBuild) {
  console.error(
    [
      "build is blocked: it writes the .next that prod serves under pm2.",
      "If you are the operator/CI: re-run with --allow-prod-build (or with",
      "ALLOW_PROD_BUILD=1 while the scripts migrate in ticket 04; the canonical",
      "`pnpm preview` path already includes it).",
      "If you are the agent verifying compilation: use `pnpm --filter chatbot build:verify`",
      "(compiles to .next/verify, isolated). build is forbidden — see AGENTS.md.",
    ].join("\n"),
  );
  process.exit(1);
}
