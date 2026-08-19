"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCollapse } from "react-collapsed";
import { ChevronDown, CodeXml, Plus } from "lucide-react";
import type { ClassNameValue } from "tailwind-merge";
import { cn } from "@/lib/utils/helpers";
import { Item } from "@/components/ui/item";
import ChatLink from "@/components/chat/link";
import { SidebarSectionTitle } from "@/components/layout/sidebar/section-title";
import {
  createCodingAgentSession,
  getCodingAgentSessions,
} from "@/lib/features/code/actions";

export interface CodingAgentSession {
  id: string;
  sessionId: string;
  label: string | null;
  updatedAt: Date;
}

export const SESSIONS_LIMIT = 10;

const AGENT_ROUTE = /^\/agent\/code\/([^/]+)\/([^/]+)/;

function parseAgentRoute(
  pathname: string,
): { project: string; sessionId: string } | null {
  const match = pathname.match(AGENT_ROUTE);
  if (!match) return null;
  return { project: decodeURIComponent(match[1]), sessionId: match[2] };
}

export interface AgentCodeSectionProps {
  projects: string[];
}

export const AgentCodeSection: React.FC<AgentCodeSectionProps> = ({
  projects,
}) => {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [sessionsMap, setSessionsMap] = useState<
    Record<string, CodingAgentSession[]>
  >({});
  const [loadingProject, setLoadingProject] = useState<string | null>(null);
  const [errorProject, setErrorProject] = useState<string | null>(null);

  const current = parseAgentRoute(pathname);

  const loadSessions = async (project: string) => {
    setLoadingProject(project);
    setErrorProject(null);
    try {
      const sessions = await getCodingAgentSessions(project, SESSIONS_LIMIT);
      setSessionsMap((prev) => ({ ...prev, [project]: sessions }));
    } catch {
      setErrorProject(project);
    } finally {
      setLoadingProject(null);
    }
  };

  // La ruta manda: al montar o navegar a una sesión se abre su proyecto y se
  // cargan sus sesiones (deep link / navegación entre proyectos).
  useEffect(() => {
    if (!current) return;
    setOpenProject(current.project);
    if (!sessionsMap[current.project] && loadingProject !== current.project) {
      void loadSessions(current.project);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.project]);

  const handleToggle = (project: string) => {
    if (openProject === project) {
      setOpenProject(null);
      return;
    }
    setOpenProject(project);
    if (!sessionsMap[project] && loadingProject !== project) {
      void loadSessions(project);
    }
  };

  const handleNewSession = (project: string) => {
    void (async () => {
      const session = await createCodingAgentSession(project);
      router.push(
        `/agent/code/${encodeURIComponent(project)}/${session.sessionId}`,
      );
    })();
  };

  return (
    <div className="my-4">
      <SidebarSectionTitle>
        <CodeXml size={14} className="mr-1" /> Coding Agent
      </SidebarSectionTitle>
      <div role="list" className="space-y-1">
        {projects.map((project) => (
          <ProjectRow
            key={project}
            project={project}
            isOpen={openProject === project}
            active={current?.project === project}
            currentSessionId={
              current?.project === project ? current.sessionId : undefined
            }
            sessions={sessionsMap[project]}
            loading={loadingProject === project}
            error={errorProject === project}
            onToggle={() => handleToggle(project)}
            onNewSession={() => handleNewSession(project)}
          />
        ))}
      </div>
    </div>
  );
};

interface ProjectRowProps {
  project: string;
  isOpen: boolean;
  active: boolean;
  currentSessionId?: string;
  sessions?: CodingAgentSession[];
  loading: boolean;
  error: boolean;
  onToggle: () => void;
  onNewSession: () => void;
}

const ProjectRow: React.FC<ProjectRowProps> = ({
  project,
  isOpen,
  active,
  currentSessionId,
  sessions,
  loading,
  error,
  onToggle,
  onNewSession,
}) => {
  const { getCollapseProps, getToggleProps } = useCollapse({
    isExpanded: isOpen,
  });

  return (
    <div className="flex flex-col gap-2">
      <Item
        className="cursor-pointer"
        aria-label={project}
        data-testid="agent-project-item"
        active={active}
        {...getToggleProps({ onClick: onToggle })}
      >
        <span className="flex-1 truncate">{project}</span>
        <button
          type="button"
          aria-label={`New session in ${project}`}
          data-testid="agent-new-session"
          className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-600 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onNewSession();
          }}
        >
          <Plus size={16} />
        </button>
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform duration-300",
            isOpen && "rotate-180",
          )}
        />
      </Item>
      <div {...getCollapseProps()}>
        <div className="flex flex-col ml-2 pl-4 my-2 border-l-2 border-zinc-300 dark:border-zinc-600">
          {loading ? (
            <div className="text-xs text-muted-foreground py-1">
              Loading sessions...
            </div>
          ) : error ? (
            <div className="text-xs text-red-500 py-1">
              No se pudieron cargar las sesiones.
            </div>
          ) : sessions ? (
            sessions.length === 0 ? (
              <div className="text-xs text-muted-foreground py-1">
                No sessions yet
              </div>
            ) : (
              sessions.map((session) => (
                <Item
                  key={session.id}
                  className="py-0"
                  active={session.sessionId === currentSessionId}
                >
                  <ChatLink
                    href={`/agent/code/${encodeURIComponent(project)}/${encodeURIComponent(session.sessionId)}`}
                    data-testid="agent-session-link"
                    className="flex-1 py-2 overflow-hidden"
                  >
                    <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                      {session.label ?? session.sessionId}
                    </span>
                  </ChatLink>
                </Item>
              ))
            )
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const AgentCodeSectionLoading: React.FC<{
  className?: ClassNameValue;
}> = ({ className }) => {
  return (
    <div className={cn("my-4", className)}>
      <div className="text-base flex items-center font-semibold text-zinc-500 dark:text-zinc-300 mb-4">
        <CodeXml size={18} className="mr-2" /> Coding Agent
      </div>
      <div className="space-y-1">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex">
            <div className="h-5 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse flex-1 mr-3" />
            <div className="h-4 w-4 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
};