import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(extensionDir, "../..");
const skillsOverrideDir = resolve(packageRoot, "skills-override");

export default function overrideExtension(pi: ExtensionAPI): void {
  pi.on("resources_discover", async () => ({
    skillPaths: [skillsOverrideDir],
  }));
}
