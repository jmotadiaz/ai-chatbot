"use client";

import ChatLink from "@/components/chat/link";
import { SearchableHistory } from "@/components/history/searchable-history";
import { getCodingAgentSessions } from "@/lib/features/code/actions";
import type { CodingAgentSessionListing } from "@/lib/features/code/types";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { usePaginatedSearch } from "@/lib/utils/hooks/use-paginated-search";

/** Sessions per page, the same page size Chat History uses. */
export const SESSIONS_PER_PAGE = 20;

export interface SessionHistoryProps {
  project: string;
  initialSessions: CodingAgentSessionListing[];
  initialHasMore: boolean;
}

/**
 * The full listing of a Project's sessions: the sidebar list without its cap,
 * with search. The rows only open the session — deleting or renaming one is a
 * different feature, and the sidebar keeps the only new-session entry point.
 */
export const SessionHistory: React.FC<SessionHistoryProps> = ({
  project,
  initialSessions,
  initialHasMore,
}) => {
  const state = usePaginatedSearch<CodingAgentSessionListing>({
    initialItems: initialSessions,
    initialHasMore,
    itemsPerPage: SESSIONS_PER_PAGE,
    fetchPage: async ({ filter, limit, offset }) => {
      const { sessions, hasMore } = await getCodingAgentSessions({
        project,
        limit,
        offset,
        filter,
      });
      return { items: sessions, hasMore };
    },
  });

  return (
    <SearchableHistory<CodingAgentSessionListing>
      title="Session History"
      state={state}
      placeholder="Filter sessions..."
      emptyMessage="No sessions found."
      getItemKey={(session) => session.id}
      testIds={{
        container: "session-history-container",
        filter: "session-history-filter",
        list: "Session history list",
      }}
      renderItem={(session) => (
        <SessionHistoryItem project={project} session={session} />
      )}
    />
  );
};

const SessionHistoryItem: React.FC<{
  project: string;
  session: CodingAgentSessionListing;
}> = ({ project, session }) => {
  return (
    <li className="flex items-center justify-between gap-4 p-3 bg-secondary rounded-lg hover:bg-secondary/80 transition-colors">
      <ChatLink
        href={`/agent/code/${encodeURIComponent(project)}/${encodeURIComponent(session.sessionId)}`}
        data-testid="session-history-link"
        className="flex-1 truncate text-sm font-medium hover:underline"
      >
        {session.label ?? session.sessionId}
      </ChatLink>
      {/* Server and client render seconds apart: the label may tick over. */}
      <time
        dateTime={session.updatedAt.toISOString()}
        suppressHydrationWarning
        className="shrink-0 text-xs text-muted-foreground"
      >
        {formatRelativeDate(session.updatedAt)}
      </time>
    </li>
  );
};
