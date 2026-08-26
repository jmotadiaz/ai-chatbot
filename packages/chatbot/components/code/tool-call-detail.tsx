"use client";

import { useState, useMemo } from "react";
import { HighlightedCode } from "./highlighted-code";
import { useFileBrowserIds } from "./file-browser/file-browser-provider";
import { SubagentToolLink } from "./subagent-tool-link";
import type { ToolCallGroup as Group } from "@/lib/features/code/types";

const MAX_LINES = 20;

function prettyArgs(args: string): { content: string; language: string } {
  if (!args || args.trim() === "" || args.trim() === "{}") {
    return { content: "(no parameters)", language: "plaintext" };
  }
  try {
    const parsed = JSON.parse(args);
    return { content: JSON.stringify(parsed, null, 2), language: "json" };
  } catch {
    return { content: args, language: "plaintext" };
  }
}

function detectResult(result: string): { content: string; language: string } {
  const trimmed = result.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed === "object" && parsed !== null) {
        return { content: JSON.stringify(parsed, null, 2), language: "json" };
      }
    } catch {
      // fall through
    }
  }
  return { content: result, language: "plaintext" };
}

export interface ToolCallDetailProps {
  group: Group;
}

export const ToolCallDetail: React.FC<ToolCallDetailProps> = ({ group }) => {
  const [expanded, setExpanded] = useState(false);
  const fileBrowserIds = useFileBrowserIds();

  const argsInfo = useMemo(() => prettyArgs(group.args), [group.args]);

  const resultInfo = useMemo(() => {
    if (group.result === undefined) return null;
    const lines = group.result.split("\n");
    const clamped = lines.length > MAX_LINES && !expanded;
    const visible = clamped ? lines.slice(0, MAX_LINES).join("\n") : group.result;
    const detected = detectResult(visible);
    return { ...detected, clamped, fullLines: lines.length };
  }, [group.result, expanded]);

  const isError = group.status === "error";

  return (
    <div className="ml-2 pl-4 my-2 border-l-2 border-zinc-300 dark:border-zinc-600 flex flex-col gap-4">
      <div>
        <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-1.5">
          Parameters
        </div>
        <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
          {argsInfo.content === "(no parameters)" ? (
            <pre className="p-3 text-xs font-mono text-muted-foreground">(no parameters)</pre>
          ) : (
            <HighlightedCode content={argsInfo.content} language={argsInfo.language} />
          )}
        </div>
      </div>

      {group.name === "subagent" && fileBrowserIds && (
        <SubagentToolLink
          project={fileBrowserIds.project}
          parentSessionId={fileBrowserIds.sessionId}
          toolCallId={group.id}
        />
      )}

      {resultInfo && (
        <div>
          <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-1.5">
            Result
          </div>
          <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
            {isError ? (
              <pre className="p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto text-red-600 dark:text-red-400">
                {resultInfo.content}
              </pre>
            ) : (
              <HighlightedCode content={resultInfo.content} language={resultInfo.language} />
            )}
            {resultInfo.clamped && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="block w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 border-t border-border"
              >
                Show more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
