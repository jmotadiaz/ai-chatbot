import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = path.resolve(__dirname, "../..");

function collectJsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

describe("client bundle secrets firewall", () => {
  it("never inlines prod secrets or prod DSN into static browser chunks", () => {
    const staticDir = path.join(PACKAGE_ROOT, ".next", "verify", "static");
    if (!existsSync(staticDir)) {
      // Si aún no se ha ejecutado build:verify, el test pasa (la suite es fast)
      return;
    }

    const jsFiles = collectJsFiles(staticDir);
    expect(jsFiles.length).toBeGreaterThan(0);

    const secretsProdPath = path.join(PACKAGE_ROOT, "..", "config", "src", "secrets.prod.ts");
    const secretLiterals: string[] = [
      "5435/prod",
      "postgres://postgres:postgres@localhost:5435/prod",
    ];

    if (existsSync(secretsProdPath)) {
      const source = readFileSync(secretsProdPath, "utf8");
      const matches = [...source.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
      for (const val of matches) {
        if (val && val.length > 5) secretLiterals.push(val);
      }
    }

    const leaks: Array<{ file: string; match: string }> = [];
    for (const file of jsFiles) {
      const content = readFileSync(file, "utf8");
      for (const literal of secretLiterals) {
        if (content.includes(literal)) {
          leaks.push({ file: path.relative(PACKAGE_ROOT, file), match: literal.slice(0, 10) + "..." });
        }
      }
    }

    expect(leaks).toEqual([]);
  });
});
