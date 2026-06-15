import { notFound } from "next/navigation";
import { ProjectList } from "@/components/agent-code/project-list";
import { getCodingAgentProjects } from "@/lib/features/agent-code/actions";
import { withAuth, type Authenticated } from "@/lib/features/auth/with-auth/hoc";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { Main } from "@/components/ui/main";

async function CodingAgentProjectsPage({ user }: Authenticated) {
  if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
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
      <Main>
        <div className="p-6 pt-16">
          <h1 className="text-2xl font-bold mb-4">Coding Agent</h1>
          <ProjectList projects={projects} />
        </div>
      </Main>
    </>
  );
}

export default withAuth(CodingAgentProjectsPage);
