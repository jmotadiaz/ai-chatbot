import { notFound } from "next/navigation";
import { config } from "config";
import { CodingAgentExplorer } from "@/components/code/coding-agent-explorer";
import { getCodingAgentProjects } from "@/lib/features/code/actions";
import {
  withAuth,
  type Authenticated,
} from "@/lib/features/auth/with-auth/hoc";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { Main } from "@/components/ui/main";
import { ClientErrorWrapper } from "@/components/code/client-error-wrapper";

async function CodingAgentProjectsPage({ user }: Authenticated) {
  if (!config.codingAgentEnabled()) return notFound();
  const projects = await getCodingAgentProjects();
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
      <Main className="justify-start">
        <div className="flex flex-col h-full w-full max-w-4xl mx-auto p-6 px-4 pt-28">
          <h1 className="text-2xl font-bold mb-6">Coding Agent</h1>
          <ClientErrorWrapper>
            <CodingAgentExplorer projects={projects} />
          </ClientErrorWrapper>
        </div>
      </Main>
    </>
  );
}

export default withAuth(CodingAgentProjectsPage);
