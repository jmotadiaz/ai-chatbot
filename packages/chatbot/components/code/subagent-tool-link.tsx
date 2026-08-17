"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, ArrowRight } from "lucide-react";
import { getSubagentSessionAction } from "@/lib/features/code/actions";

export interface SubagentToolLinkProps {
  project: string;
  parentSessionId: string;
  toolCallId: string;
}

/**
 * Resolves the `toolCallId → subSessionId` mapping via the worker's
 * getSubagentSession RPC (spec D6) and links to the dedicated read-only
 * sub-session view. Renders nothing while loading or when the lookup
 * fails (e.g. a validation-error result that never created a session).
 */
export const SubagentToolLink: React.FC<SubagentToolLinkProps> = ({
  project,
  parentSessionId,
  toolCallId,
}) => {
  const [ids, setIds] = React.useState<
    { subSessionId: string } | "error" | null
  >(null);

  React.useEffect(() => {
    let cancelled = false;
    void getSubagentSessionAction({ parentSessionId, toolCallId }).then(
      (result) => {
        if (cancelled) return;
        setIds("error" in result ? "error" : result);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [parentSessionId, toolCallId]);

  if (!ids || ids === "error") return null;

  return (
    <div className="border-t border-border">
      <Link
        href={`/agent/code/${project}/${parentSessionId}/subagent/${ids.subSessionId}`}
        className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-secondary"
      >
        <Bot className="size-4 text-muted-foreground" />
        <span className="flex-1">Ver sesión del subagente</span>
        <ArrowRight className="size-4 text-muted-foreground" />
      </Link>
    </div>
  );
};
