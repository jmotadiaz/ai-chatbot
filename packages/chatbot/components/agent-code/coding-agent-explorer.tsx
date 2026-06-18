"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { ChevronRight, ChevronDown } from "lucide-react";
import {
  getCodingAgentSessions,
  getCodingAgentMessages,
  createCodingAgentSession,
} from "@/lib/features/agent-code/actions";

interface Session {
  id: string;
  sessionId: string;
  label: string | null;
  updatedAt: Date;
}

interface CodingAgentExplorerProps {
  projects: string[];
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && "type" in part && (part as { type: string }).type === "text" && "text" in part) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

function truncateOnFirstLine(text: string, max = 80): string {
  const firstLine = text.replace(/\s+/g, " ").trim().split("\n")[0] ?? "";
  if (firstLine.length <= max) return firstLine;
  return `${firstLine.slice(0, max).trimEnd()}…`;
}

export const CodingAgentExplorer: React.FC<CodingAgentExplorerProps> = ({
  projects,
}) => {
  const [expandedProject, setExpandedProject] = useQueryState("project");
  const [sessionsMap, setSessionsMap] = useState<Record<string, Session[]>>({});
  const [promptsBySession, setPromptsBySession] = useState<Record<string, string>>({});
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

  useEffect(() => {
    if (!expandedProject) return;
    const sessions = sessionsMap[expandedProject];
    if (!sessions) return;
    const unlabeled = sessions.filter((s) => !s.label && !promptsBySession[s.sessionId]);
    if (unlabeled.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const s of unlabeled) {
        try {
          const messages = await getCodingAgentMessages(expandedProject, s.sessionId);
          const firstUser = messages.find((m) => m.role === "user");
          const text = extractText(firstUser?.content);
          if (text) {
            updates[s.sessionId] = truncateOnFirstLine(text);
          }
        } catch {}
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setPromptsBySession((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expandedProject, sessionsMap, promptsBySession]);

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
          <div key={project} className="bg-secondary rounded-lg overflow-hidden">
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
                        {sessions.map((session) => {
                          const display = session.label ?? promptsBySession[session.sessionId] ?? session.sessionId;
                          return (
                            <Link
                              key={session.id}
                              href={`/agent/code/${encodeURIComponent(project)}/${session.sessionId}`}
                              className="block p-3 bg-secondary rounded-lg transition-colors"
                            >
                              <h4 className="font-semibold text-sm hover:underline truncate" title={display}>
                                {display}
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">
                                {session.updatedAt.toLocaleString()}
                              </p>
                            </Link>
                          );
                        })}
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
