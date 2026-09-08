import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { PI_PROVIDER, generateModelsJson, type PiModelBaseline, type ThinkingLevelMap } from "models";
import { getModelsJsonPath } from "../src/runtime/models";

/**
 * Pi's own definitions for the models it already ships. The catalog is merged
 * on top of these so a catalog entry never downgrades a built-in model's
 * context window, output limit or cost. A hermetic in-memory ModelRuntime is
 * used on purpose (SDK ≥ 0.80.8 replaced the in-memory AuthStorage +
 * ModelRegistry pair): it points at throwaway temp paths so it reads neither
 * models.json (which this script is about to write) nor the real auth.json,
 * and network catalog refresh stays off.
 */
async function readBuiltInBaselines(): Promise<Map<string, PiModelBaseline>> {
  const tmp = mkdtempSync(path.join(tmpdir(), "pi-baselines-"));
  try {
    const runtime = await ModelRuntime.create({
      authPath: path.join(tmp, "auth.json"),
      modelsPath: null,
      modelsStorePath: path.join(tmp, "models-store.json"),
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    return new Map(
      runtime
        .getModels()
        .filter((model) => model.provider === PI_PROVIDER)
        .map((model) => [
          model.id,
          {
            reasoning: model.reasoning,
            input: [...model.input],
            contextWindow: model.contextWindow,
            maxTokens: model.maxTokens,
            cost: model.cost,
            api: (model as { api?: string }).api,
            baseUrl: (model as { baseUrl?: string }).baseUrl,
            thinkingLevelMap: (model as { thinkingLevelMap?: ThinkingLevelMap })
              .thinkingLevelMap,
          },
        ]),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const modelsJson = generateModelsJson(undefined, {
  builtIns: await readBuiltInBaselines(),
});

const target = getModelsJsonPath();
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(modelsJson, null, 2)}\n`);
console.log(`models.json written to ${target}`);
