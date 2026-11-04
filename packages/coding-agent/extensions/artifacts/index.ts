import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  listArtifacts,
  publishArtifact,
  type ArtifactRef,
} from "../../src/artifacts/artifacts";
import { getArtifactsDir } from "../../src/runtime/paths";

/**
 * First-party `publish_artifact` tool and `/artifacts` command. Loaded via
 * `additionalExtensionPaths` like the subagent extension.
 *
 * Why it exists: the report-generating skills were written for a laptop. They
 * write a self-contained HTML file and `xdg-open` it, which on a headless host
 * leaves the artifact at a path the user cannot see. Publishing copies it into
 * the artifacts root, `<project>/<name>/index.html`, and returns the Chatbot view
 * path, which the user follows inside the chat UI.
 *
 * Publishing is explicit: no hook publishes files the agent writes on its own.
 * All logic lives in `src/artifacts/artifacts.ts`; this file is a thin shell.
 */

const PublishArtifactParams = Type.Object({
  path: Type.String({
    description:
      "HTML file (.html/.htm) to publish, or a directory containing index.html. The source is left in place",
  }),
  name: Type.String({
    description:
      "Artifact name, used as its folder and URL segment, e.g. architecture-review. Publishing again with the same name overwrites the artifact in place",
  }),
});

export default function registerArtifactsExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "publish_artifact",
    label: "Publish artifact",
    description:
      "Publish a generated HTML report or interactive artifact so the user can open it in the Chatbot, and return the view path to show them. Call this after writing any visual artifact instead of trying to open it with xdg-open, open or start: this agent runs headless, so those silently do nothing.",
    promptSnippet: "Publish generated HTML artifacts and get a Chatbot view path for the user",
    promptGuidelines: [
      "After writing any HTML report or artifact meant for the user to read, call publish_artifact({ path, name }) and put the returned path in your reply.",
      "Never try to open a file in a browser yourself (xdg-open/open/start); the host has no display. The path from publish_artifact is the way the user sees it.",
      "Publishing again with the same name replaces the artifact in place, so reuse the name when you revise an artifact.",
    ],
    parameters: PublishArtifactParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const artifact = await publishOrError(params.path, params.name, ctx);
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

  pi.registerCommand("artifacts", {
    description: "List published artifacts with their Chatbot view paths",
    async handler(_args, ctx) {
      const artifacts = await listArtifacts({
        rootDir: getArtifactsDir(),
        sessionId: ctx.sessionManager.getSessionId(),
      });
      if (artifacts.length === 0) {
        ctx.ui.notify("No published artifacts yet", "info");
        return;
      }
      ctx.ui.notify(
        artifacts.map((a) => `${a.title}\n  ${a.path}`).join("\n"),
        "info",
      );
    },
  });
}

function formatArtifact(artifact: ArtifactRef): string {
  return `Published: ${artifact.title}\nURL: ${artifact.path}`;
}

/**
 * Publish, or a one-line model-readable error. Never throws into the loop:
 * invalid names, missing paths and non-HTML sources all come back as text.
 */
async function publishOrError(
  sourcePath: string,
  name: string,
  ctx: { cwd: string; sessionManager: { getSessionId(): string } },
): Promise<ArtifactRef | { error: string }> {
  try {
    return await publishArtifact({
      sourcePath,
      name,
      cwd: ctx.cwd,
      sessionId: ctx.sessionManager.getSessionId(),
      rootDir: getArtifactsDir(),
    });
  } catch (error) {
    return {
      error: `Could not publish ${sourcePath} as "${name}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
