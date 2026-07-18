import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ProjectFormContainer } from "@/components/project/form-container";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { NewChatHeader } from "@/components/chat/new";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { getProjectById } from "@/lib/features/project/queries";
import { withAuth, Authenticated } from "@/lib/features/auth/with-auth/hoc";

interface EditProjectPageProps extends Authenticated {
  params: Promise<{
    id: string;
  }>;
}

const EditProjectPage: React.FC<EditProjectPageProps> = async ({
  params,
  user,
}) => {
  const { id } = await params;

  const project = await getProjectById({ id, userId: user.id });

  if (!project || project.userId !== user.id) {
    const uuid = crypto.randomUUID();
    redirect(`/project/${uuid}/add`);
  }

  if (!project.isActive) {
    redirect(`/project/${project.id}/add`);
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
        <ProjectFormContainer project={project} />
      </div>
    </>
  );
};

export default withAuth(EditProjectPage);
