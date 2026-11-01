import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Builds the commit attribution instructions for the current model.
 * Injected on every turn via `before_agent_start`.
 */
export function buildCommitAttributionPrompt(modelName?: string): string {
  const name = modelName?.trim() || "AI Assistant";
  return `## Commit Attribution

When creating git commits, you MUST include the co-author attribution trailer in the commit message:

\`\`\`
Co-Authored-By: ${name}
\`\`\``;
}

/**
 * First-party extension: commit attribution prompt injection.
 *
 * Appends the model's specific Co-Authored-By trailer instructions to the
 * system prompt on each turn via `before_agent_start`.
 * Because it hooks into `before_agent_start`, it dynamically adapts if the model
 * changes mid-session (e.g. via turn configuration or model cycling).
 */
export default function registerCommitAttributionExtension(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event, ctx) => {
    const model = ctx.model;
    const modelName = model?.name || model?.id;
    const attributionPrompt = buildCommitAttributionPrompt(modelName);

    const basePrompt = event.systemPrompt ?? "";
    const systemPrompt = basePrompt
      ? `${basePrompt}\n\n${attributionPrompt}`
      : attributionPrompt;

    return { systemPrompt };
  });
}
