import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getSubagentRunner } from "../../src/subagent-bridge";
import { buildSubagentToolDescription } from "./description";

const SubagentParams = Type.Object({
  task: Type.String({ description: "Self-contained task prompt for the subagent" }),
  description: Type.Optional(
    Type.String({ description: "Short label for UI display" }),
  ),
  model: Type.Optional(
    Type.String({
      description:
        "provider/model-id for the subagent; defaults to this session's model",
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description:
        "Working directory for the subagent, inside the project root (e.g. a git worktree). Defaults to this session's cwd",
    }),
  ),
  agent: Type.Optional(Type.String({ description: "RESERVED — do not use" })),
});

/**
 * Thin shell over the worker's runSubagent(): all logic lives in
 * src/session-manager.ts so it stays unit-testable. Loaded via
 * additionalExtensionPaths; child sessions are created without this
 * extension (structural anti-recursion, spec §4.2).
 *
 * The runner is resolved off globalThis instead of imported: Pi loads this
 * file through jiti, so importing session-manager would hand us a second,
 * empty copy of the worker's session state (see src/subagent-bridge).
 */
export default function registerSubagentExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: buildSubagentToolDescription([]),
    parameters: SubagentParams,
    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      if (params.agent !== undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text: "The 'agent' param is reserved for a future agent-definition format and is not supported.",
            },
          ],
          details: { reserved: true },
          isError: true,
        };
      }
      const runSubagent = getSubagentRunner();
      if (!runSubagent) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Subagent runner unavailable: the worker did not publish it. This session cannot dispatch subagents.",
            },
          ],
          details: { unavailable: true },
          isError: true,
        };
      }
      const parentPiSessionId = ctx.sessionManager.getSessionId();
      return runSubagent(parentPiSessionId, toolCallId, params, signal);
    },
  });
}
