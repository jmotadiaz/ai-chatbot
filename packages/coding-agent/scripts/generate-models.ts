import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateModelsJson } from "models";
import { getModelsJsonPath } from "../src/models";

const target = getModelsJsonPath();
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(generateModelsJson(), null, 2)}\n`);
console.log(`models.json written to ${target}`);
