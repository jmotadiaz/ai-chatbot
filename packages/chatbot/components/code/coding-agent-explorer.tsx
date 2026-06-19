"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { ChevronRight, ChevronDown } from "lucide-react";
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
    <div className="space-y-2">
      {projects.map((project) => {
        const isExpanded = expandedProject === project;
        const sessions = sessionsMap[project];
        const isLoading = loadingProject === project;

        return (
          <div
            key={project}
            className="bg-secondary rounded-lg overflow-hidden"
          >
            <button
              onClick={() => handleToggle(project)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <span className="font-semibold">{project}</span>
            </button>

            {isExpanded && (
              <div className="border-t border-border">
                {isLoading ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    Loading sessions...
                  </div>
                ) : sessions ? (
                  <div className="p-3">
                    <button
                      onClick={() => handleCreateSession(project)}
                      className="mb-3 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
                    >
                      + New session
                    </button>
                    {sessions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No sessions yet
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {sessions.map((session) => (
                          <Link
                            key={session.id}
                            href={`/agent/code/${encodeURIComponent(project)}/${session.sessionId}`}
                            className="block p-3 bg-secondary rounded-lg transition-colors"
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
            )}
          </div>
        );
      })}
    </div>
  );
};
