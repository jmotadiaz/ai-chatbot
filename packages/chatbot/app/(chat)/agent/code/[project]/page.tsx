import { notFound } from "next/navigation";
import { SessionList } from "@/components/agent-code/session-list";
import {
  getCodingAgentSessions,
  createCodingAgentSession,
} from "@/lib/features/agent-code/actions";
import { withAuth, type Authenticated } from "@/lib/features/auth/with-auth/hoc";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { Main } from "@/components/ui/main";

async function CodingAgentSessionsPage({
  params,
  user,
}: {
  params: Promise<{ project: string }>;
} & Authenticated) {
  if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
  const { project } = await params;
  const sessions = await getCodingAgentSessions(project);

  async function createSession() {
    "use server";
    const session = await createCodingAgentSession(project);
    return session.sessionId;
  }

  return (
    <>
      <Sidebar user={user} />
      <Header.Container>
        <Header.Left>
          <Logo />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <Main>
        <div className="p-6 pt-16">
          <h1 className="text-2xl font-bold mb-4">{project}</h1>
          <SessionList
            project={project}
            sessions={sessions}
            onCreateSession={createSession}
          />
        </div>
      </Main>
    </>
  );
}

export default withAuth(CodingAgentSessionsPage);
