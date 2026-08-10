import path from "node:path";
import { existsSync, realpathSync } from "node:fs";
import {
  loadSkillsFromDir,
  type ResourceLoader,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import { getSkillsOverrideDir } from "./pi-packages";

function canonicalPath(filePath: string): string {
  try {
    return realpathSync.native(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

/**
 * Enforce the harness override layer as a runtime invariant.
 *
 * Every valid skill discovered under skills-override must be the effective
 * winner with the same name after all extension resources have been bound.
 */
export function assertSkillOverridesApplied(
  resourceLoader: Pick<ResourceLoader, "getSkills">,
  overrideDir: string = getSkillsOverrideDir(),
): void {
  if (!existsSync(overrideDir)) {
    throw new Error(`Skills override directory does not exist: ${overrideDir}`);
  }

  const expected = loadSkillsFromDir({
    dir: overrideDir,
    source: "harness-override",
  });
  if (expected.diagnostics.length > 0) {
    const details = expected.diagnostics
      .map(
        (diagnostic) =>
          `${diagnostic.message}${diagnostic.path ? ` (${diagnostic.path})` : ""}`,
      )
      .join("; ");
    throw new Error(`Invalid harness skill overrides: ${details}`);
  }

  const loaded = resourceLoader.getSkills();
  const loadedByName = new Map<string, Skill>(
    loaded.skills.map((skill) => [skill.name, skill]),
  );
  const mismatches = expected.skills.flatMap((override) => {
    const winner = loadedByName.get(override.name);
    if (
      winner &&
      canonicalPath(winner.filePath) === canonicalPath(override.filePath)
    ) {
      return [];
    }
    return [
      `${override.name}: expected ${override.filePath}, got ${winner?.filePath ?? "missing"}`,
    ];
  });

  if (mismatches.length === 0) return;

  const overrideNames = new Set(expected.skills.map((skill) => skill.name));
  const collisions = loaded.diagnostics
    .filter(
      (diagnostic) =>
        diagnostic.type === "collision" &&
        diagnostic.collision &&
        overrideNames.has(diagnostic.collision.name),
    )
    .map(
      (diagnostic) =>
        `${diagnostic.collision!.name}: winner ${diagnostic.collision!.winnerPath}, ` +
        `loser ${diagnostic.collision!.loserPath}`,
    );
  const collisionDetails =
    collisions.length > 0 ? ` Collisions: ${collisions.join("; ")}.` : "";

  throw new Error(
    `Harness skill override invariant failed: ${mismatches.join("; ")}.${collisionDetails}`,
  );
}
