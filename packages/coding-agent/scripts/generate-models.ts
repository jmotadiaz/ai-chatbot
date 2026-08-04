import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { PI_PROVIDER, generateModelsJson, type PiModelBaseline } from "models";
import { getModelsJsonPath } from "../src/models";

/**
 * Pi's own definitions for the models it already ships. The catalog is merged
 * on top of these so a catalog entry never downgrades a built-in model's
 * context window, output limit or cost. An in-memory registry is used on
 * purpose: it reads neither models.json (which this script is about to write)
 * nor auth.json.
 */
function readBuiltInBaselines(): Map<string, PiModelBaseline> {
  const registry = ModelRegistry.inMemory(AuthStorage.inMemory());
  return new Map(
    registry
      .getAll()
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
        },
      ]),
  );
}

const modelsJson = generateModelsJson(undefined, {
  builtIns: readBuiltInBaselines(),
});

const target = getModelsJsonPath();
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(modelsJson, null, 2)}\n`);
console.log(`models.json written to ${target}`);
