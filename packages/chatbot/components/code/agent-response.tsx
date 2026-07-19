"use client";

import * as React from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { useFileBrowser } from "./file-browser/file-browser-provider";
import { Response } from "@/components/chat/response";
import {
  fileViewHref,
  parseFileReferenceHref,
} from "@/lib/features/code/file-browser/file-links";

type AnchorProps = React.ComponentPropsWithoutRef<"a"> & { node?: unknown };

/**
 * Markdown link renderer for coding-agent responses. `file:` references
 * (the convention the worker's system prompt teaches the model) become
 * in-app links to the full-file view; everything else stays an external
 * link. Malformed file references degrade to plain text.
 */
const AgentAnchor: React.FC<AnchorProps> = ({ href, children, node: _node, ...rest }) => {
  const { project, sessionId } = useFileBrowser();

  if (href?.startsWith("file:")) {
    const path = parseFileReferenceHref(href);
    if (!path) {
      return <span>{children}</span>;
    }
    return (
      <Link
        href={fileViewHref(project, sessionId, path)}
        data-testid="agent-file-link"
        className="inline-flex items-baseline gap-1 rounded bg-secondary px-1 font-mono text-[0.9em] font-medium text-primary no-underline hover:underline"
      >
        <FileText className="size-3 self-center text-muted-foreground" />
        {children}
      </Link>
    );
  }

  // Match streamdown's default link styling for non-file links.
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="wrap-anywhere font-medium text-primary underline"
      {...rest}
    >
      {children}
    </a>
  );
};

const COMPONENTS = { a: AgentAnchor };

export interface AgentResponseProps {
  children: string;
}

export const AgentResponse: React.FC<AgentResponseProps> = ({ children }) => (
  <Response components={COMPONENTS}>{children}</Response>
);
