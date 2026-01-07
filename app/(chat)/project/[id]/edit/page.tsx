import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ProjectForm } from "@/components/project/form";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { NewChatHeader } from "@/components/chat/new";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { getProjectById } from "@/lib/features/project/queries";
import { withAuth, AuthenticatedPage } from "@/lib/features/auth/with-auth";

interface EditProjectPageProps extends AuthenticatedPage {
  params: Promise<{
    id: string;
  }>;
}

const EditProjectPage: React.FC<EditProjectPageProps> = async ({ params, user }) => {
  const { id } = await params;

  const project = await getProjectById({ id, userId: user.id });

  if (!project) {
    redirect("/project/new");
  }

  return (
    <>
      <div className="h-svh flex flex-col justify-center w-full stretch">
        <Sidebar projectId={id} user={user} />
        <Header.Container>
          <Header.Left>
            <Logo />
            <NewChatHeader />
          </Header.Left>
          <Header.Right>
            <ThemeToggle />
          </Header.Right>
        </Header.Container>
        <ProjectForm project={project} />
      </div>
    </>
  );
};

export default withAuth(EditProjectPage);
