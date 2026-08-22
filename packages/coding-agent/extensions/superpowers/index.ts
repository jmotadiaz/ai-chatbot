import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Superpowers extension: registers the vendored skills (skills/) as resources.
 *
 * The using-superpowers bootstrap does NOT live here. Upstream injects it at
 * session start through the extension `context` event, but the SDK's provider
 * adapters never consume `transformContext`, so that event never fires in this
 * harness. The content is embedded in `./using-superpowers.ts` and appended to
 * the system prompt by the session manager (`resourceLoaderOptions.appendSystemPrompt`),
 * which is the channel verified to reach every model request.
 */
const extensionDir = dirname(fileURLToPath(import.meta.url));
const skillsDir = resolve(extensionDir, "skills");

export default function superpowersExtension(pi: ExtensionAPI): void {
  pi.on("resources_discover", async () => ({
    skillPaths: [skillsDir],
  }));
}