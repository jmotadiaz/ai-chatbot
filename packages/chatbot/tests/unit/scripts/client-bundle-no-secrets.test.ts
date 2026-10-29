import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  VERIFY_STATIC_DIR,
  inspectClientBundle,
  loadSecretLiterals,
} from "../../../scripts/client-bundle";

const PACKAGE_ROOT = path.resolve(__dirname, "../../..");
const staticDir = path.join(PACKAGE_ROOT, VERIFY_STATIC_DIR);
const built = existsSync(staticDir);

// Skipped (not passed) when no isolated build exists: `pnpm inspect:bundle`
// reports the same absence explicitly, and `pnpm verify:full` requires it.
describe.skipIf(!built)("client bundle secrets firewall (requires .next/verify from build:verify)", () => {
  it("never inlines prod secrets or prod DSN into static browser chunks", () => {
    const secretsProdPath = path.join(PACKAGE_ROOT, "..", "config", "src", "secrets.prod.ts");
    const result = inspectClientBundle({
      staticDir,
      secretLiterals: loadSecretLiterals(secretsProdPath),
    });
    expect(result).toMatchObject({ status: "inspected" });
  });
});
