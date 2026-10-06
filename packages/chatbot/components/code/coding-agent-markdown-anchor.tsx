"use client";

import {
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import Link from "next/link";
import { useFileBrowser } from "./file-browser/file-browser-provider";
import {
  fileViewHref,
  parseFileReferenceHref,
  resolveNoteLink,
} from "@/lib/features/code/file-browser/file-links";

/**
 * Project-relative path of the file whose rendered Markdown the anchors live
 * in. Note Links resolve against it, so only Markdown rendered by the file
 * browser's preview carries it — chat messages stay without it and keep their
 * current (external) link behaviour.
 */
const NoteLinkOriginContext = createContext<string | null>(null);

export const NoteLinkOriginProvider: React.FC<{
  path: string;
  children: React.ReactNode;
}> = ({ path, children }) => (
  <NoteLinkOriginContext.Provider value={path}>
    {children}
  </NoteLinkOriginContext.Provider>
);

export type CodingAgentMarkdownAnchorProps = ComponentPropsWithoutRef<"a"> & {
  node?: unknown;
};

/**
 * Turns the coding agent's `file:` Markdown references and the vault's Note
 * Links into file-browser navigation. Regular links remain external and
 * unsafe note paths become text.
 */
export const CodingAgentMarkdownAnchor: React.FC<
  CodingAgentMarkdownAnchorProps
> = ({ href, children, node: _node, ...rest }) => {
  const { actions, project, sessionId } = useFileBrowser();
  const router = useRouter();
  const containerFile = useContext(NoteLinkOriginContext);

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

  if (containerFile) {
    const resolution = resolveNoteLink(href, containerFile);
    if (resolution.kind === "navigate") {
      const url = fileViewHref(project, sessionId, resolution.path);
      const openDirectly = (event: MouseEvent) => {
        // The provider ignores post-mount URL changes, so a same-route Link
        // alone would leave the view untouched (and repeating the click
        // would be a no-op URL): plain clicks re-apply the location directly.
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        actions.applyLocation({ scope: "tree", file: resolution.path });
        router.push(url);
      };
      return (
        <Link
          href={url}
          data-testid="agent-note-link"
          className="wrap-anywhere font-medium text-primary underline"
          onClick={openDirectly}
        >
          {children}
        </Link>
      );
    }
    if (resolution.kind === "unsafe") {
      return <span className="wrap-anywhere">{children}</span>;
    }
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
