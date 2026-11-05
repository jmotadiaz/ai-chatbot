import { notFound } from "next/navigation";
import { config } from "config";
import {
  SessionHistory,
  SESSIONS_PER_PAGE,
} from "@/components/code/session-history";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { getCodingAgentSessions } from "@/lib/features/code/actions";
import { withAuth, type Authenticated } from "@/lib/features/auth/with-auth/hoc";

async function CodingAgentSessionHistoryPage({
  params,
  user,
}: {
  params: Promise<{ project: string }>;
} & Authenticated) {
  if (!config.codingAgentEnabled()) return notFound();
  const { project } = await params;

  // The first page is rendered here, so mounting the page does not refetch it.
  const { sessions, hasMore } = await getCodingAgentSessions({
    project,
    limit: SESSIONS_PER_PAGE,
  });

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
      <div className="flex-1 w-full flex flex-col items-center p-4 pt-28">
        <SessionHistory
          project={project}
          initialSessions={sessions}
          initialHasMore={hasMore}
        />
      </div>
    </>
  );
}

export default withAuth(CodingAgentSessionHistoryPage);
