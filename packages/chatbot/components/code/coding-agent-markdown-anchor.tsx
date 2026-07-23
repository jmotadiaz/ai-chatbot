"use client";

import type { ComponentPropsWithoutRef } from "react";
import { FileText } from "lucide-react";
import Link from "next/link";
import { useFileBrowser } from "./file-browser/file-browser-provider";
import {
  fileViewHref,
  parseFileReferenceHref,
} from "@/lib/features/code/file-browser/file-links";

export type CodingAgentMarkdownAnchorProps = ComponentPropsWithoutRef<"a"> & {
  node?: unknown;
};

/**
 * Turns the coding agent's `file:` Markdown references into file-browser
 * navigation. Regular links remain external and unsafe file paths become text.
 */
export const CodingAgentMarkdownAnchor: React.FC<
  CodingAgentMarkdownAnchorProps
> = ({ href, children, node: _node, ...rest }) => {
  const { project, sessionId } = useFileBrowser();

  if (href?.startsWith("file:")) {
    const path = parseFileReferenceHref(href);
    if (!path) return <span>{children}</span>;

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
