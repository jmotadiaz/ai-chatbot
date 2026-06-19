"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { Collapsible } from "@/components/ui/internal-collapsible";
import {
  getCodingAgentSessions,
  createCodingAgentSession,
} from "@/lib/features/code/actions";

interface Session {
  id: string;
  sessionId: string;
  label: string | null;
  updatedAt: Date;
}

interface CodingAgentExplorerProps {
  projects: string[];
}

export const CodingAgentExplorer: React.FC<CodingAgentExplorerProps> = ({
  projects,
}) => {
  const [expandedProject, setExpandedProject] = useQueryState("project");
  const [sessionsMap, setSessionsMap] = useState<Record<string, Session[]>>({});
  const [loadingProject, setLoadingProject] = useState<string | null>(null);
  const router = useRouter();

  const handleToggle = async (project: string) => {
    if (expandedProject === project) {
      setExpandedProject(null);
      return;
    }
    setExpandedProject(project);

    if (!sessionsMap[project]) {
      setLoadingProject(project);
      const sessions = await getCodingAgentSessions(project);
      setSessionsMap((prev) => ({ ...prev, [project]: sessions }));
      setLoadingProject(null);
    }
  };

  const handleCreateSession = async (project: string) => {
    const session = await createCodingAgentSession(project);
    router.push(
      `/agent/code/${encodeURIComponent(project)}/${session.sessionId}`,
    );
  };

  return (
    <div className="space-y-4">
      {projects.map((project) => {
        const isExpanded = expandedProject === project;
        const sessions = sessionsMap[project];
        const isLoading = loadingProject === project;

        return (
          <Collapsible
            key={project}
            title={project}
            isOpen={isExpanded}
            onToggle={() => handleToggle(project)}
            className="bg-secondary rounded-lg overflow-hidden border-none px-4"
          >
            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 pb-2">
              {isLoading ? (
                <div className="text-sm text-muted-foreground py-2">
                  Loading sessions...
                </div>
              ) : sessions ? (
                <div>
                  <button
                    onClick={() => handleCreateSession(project)}
                    className="mb-4 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-sm transition-colors font-medium"
                  >
                    + New session
                  </button>
                  {sessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No sessions yet
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {sessions.map((session) => (
                        <Link
                          key={session.id}
                          href={`/agent/code/${encodeURIComponent(project)}/${session.sessionId}`}
                          className="block p-3 bg-background border border-border hover:border-zinc-300 dark:hover:border-zinc-600 rounded-lg transition-colors"
                        >
                          <h4
                            className="font-semibold text-sm hover:underline truncate"
                            title={session.label ?? session.sessionId}
                          >
                            {session.label ?? session.sessionId}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {session.updatedAt.toLocaleString()}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
};

