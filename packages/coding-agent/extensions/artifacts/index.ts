import path from "node:path";
import { Type } from "typebox";
import { isWriteToolResult, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  isTempArtifactPath,
  listArtifacts,
  publishArtifact,
  type ArtifactRef,
} from "../../src/artifacts";
import { getArtifactsBaseUrl, getArtifactsDir } from "../../src/paths";

/**
 * First-party `publish_artifact` tool + automatic publishing of temp-dir
 * reports. Loaded via `additionalExtensionPaths` like the subagent extension.
 *
 * Why it exists: the report-generating skills were written for a laptop. They
 * write a self-contained HTML file to the OS temp directory and `xdg-open` it,
 * which on a headless host leaves the artifact stranded at a path the user
 * cannot see. Publishing gives the user a URL instead, which is what the web
 * UI can act on.
 *
 * All logic lives in `src/artifacts.ts`, shared with the worker's
 * `GET /artifacts` route; this file is a thin shell. It imports that module
 * directly rather than through a `globalThis` bridge (contrast
 * `src/subagent-bridge.ts`) because artifacts are stateless: jiti re-evaluates
 * it into a second module instance, and both copies read the same env through
 * `config` and the same files through `node:fs`.
 */

const PublishArtifactParams = Type.Object({
  path: Type.String({
    description:
      "File to publish, e.g. /tmp/architecture-review-20260831-153639.html. Anything works; the source is left in place",
  }),
  title: Type.Optional(
    Type.String({
      description: "Display label; defaults to the report's <title>, else the file name",
    }),
  ),
});

export default function registerArtifactsExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "publish_artifact",
    label: "Publish artifact",
    description:
      "Publish a generated report or document (HTML, markdown, PDF, image) so the user can open it in a browser, and return the URL to show them. Call this after writing any visual artifact instead of trying to open it with xdg-open, open or start: this agent runs headless, so those silently do nothing.",
    promptSnippet:
      "Publish generated reports/artifacts and get a browser URL for the user",
    promptGuidelines: [
      "After writing any HTML/markdown/PDF report meant for the user to read, call publish_artifact and put the returned URL in your reply.",
      "Never try to open a file in a browser yourself (xdg-open/open/start); the host has no display. The URL from publish_artifact is the way the user sees it.",
      "Generated reports land in an index at GET /artifacts on the worker, so users can find past ones without you.",
    ],
    parameters: PublishArtifactParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const artifact = await publishOrError(params.path, params.title, ctx.cwd);
      if ("error" in artifact) {
        return {
          content: [{ type: "text" as const, text: artifact.error }],
          details: { error: artifact.error },
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: formatArtifact(artifact) }],
        details: { artifact },
      };
    },
  });

  /**
   * Safety net for skills that were never updated: a report the agent writes to
   * the temp directory gets published on its own, and the URL is appended to
   * the write result the model then reads. Vendored skill text stays a
   * convenience, not a dependency — Matt Pocock's skills are pinned by
   * `skills-lock.json`, so an upstream sync would otherwise undo it.
   */
  pi.on("tool_result", async (event, ctx) => {
    if (event.isError || !isWriteToolResult(event)) return undefined;

    const written = rawInputPath(event.input);
    if (!written || !isTempArtifactPath(path.resolve(ctx.cwd, written))) {
      return undefined;
    }
    const absolute = path.resolve(ctx.cwd, written);
    const artifact = await publishOrError(absolute, undefined, ctx.cwd);
    if ("error" in artifact) return undefined;

    return {
      content: [
        ...event.content,
        { type: "text" as const, text: `\n${formatArtifact(artifact)}` },
      ],
    };
  });

  pi.registerCommand("artifacts", {
    description: "List published artifacts with their URLs",
    async handler(_args, ctx) {
      const artifacts = await listArtifacts({
        rootDir: getArtifactsDir(),
        baseUrl: getArtifactsBaseUrl(),
      });
      if (artifacts.length === 0) {
        ctx.ui.notify("No published artifacts yet", "info");
        return;
      }
      ctx.ui.notify(
        artifacts.map((a) => `${a.title}\n  ${a.url}`).join("\n"),
        "info",
      );
    },
  });
}

function rawInputPath(input: Record<string, unknown>): string | undefined {
  const value = input.path ?? input.file_path;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatArtifact(artifact: ArtifactRef): string {
  return `Published: ${artifact.title}\nURL: ${artifact.url}`;
}

/** Publish, or a one-line model-readable error. Never throws into the loop. */
async function publishOrError(
  sourcePath: string,
  title: string | undefined,
  cwd: string,
): Promise<ArtifactRef | { error: string }> {
  try {
    return await publishArtifact({
      sourcePath,
      title,
      cwd,
      rootDir: getArtifactsDir(),
      baseUrl: getArtifactsBaseUrl(),
    });
  } catch (error) {
    return {
      error: `Could not publish ${sourcePath}: ${
        error instanceof Error ? error.message : String(error)
      }. Check the file exists and the artifacts directory is writable.`,
    };
  }
}
