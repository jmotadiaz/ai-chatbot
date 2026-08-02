"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AgentConversation } from "./agent-conversation";
import { FileBrowserProvider } from "./file-browser/file-browser-provider";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { Main } from "@/components/ui/main";
import { useCodingAgent } from "@/lib/features/code/hooks/use-coding-agent";

export interface SubagentSessionViewProps {
  project: string;
  parentSessionId: string;
  subSessionId: string;
  subPiSessionId?: string;
}

/**
 * Read-only view of a subagent sub-session (spec §5.2, D3): Header with a
 * back link to the parent session plus the conversation fed by the sub
 * session's own snapshot/stream. No composer, no model picker, no new-
 * session button — there is deliberately no read-only flag, the route
 * simply does not compose the input controls.
 */
export const SubagentSessionView: React.FC<SubagentSessionViewProps> = ({
  project,
  parentSessionId,
  subSessionId,
  subPiSessionId,
}) => {
  const { items, isRunning, status, turnFiles } = useCodingAgent({
    project,
    sessionId: subSessionId,
    // The view never sends messages, so no model is needed.
    modelId: "",
    parentSessionId,
    piSessionId: subPiSessionId,
  });

  return (
    <FileBrowserProvider project={project} sessionId={subSessionId}>
      <Header.Container>
        <Header.Left>
          <Logo />
          <Link
            href={`/agent/code/${project}/${parentSessionId}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Volver a la sesión principal
          </Link>
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <Main>
        <div className="flex flex-col relative h-full pt-16">
          <AgentConversation
            items={items}
            isRunning={isRunning}
            status={status}
            turnFiles={turnFiles}
          />
        </div>
      </Main>
    </FileBrowserProvider>
  );
};
