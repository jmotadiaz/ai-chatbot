import { redirect } from "next/navigation";
import { ProjectFormContainer } from "@/components/project/form-container";
import { withAuth, Authenticated } from "@/lib/features/auth/with-auth/hoc";
import { getProjectById } from "@/lib/features/project/queries";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { NewChatHeader } from "@/components/chat/new";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { Sidebar } from "@/components/layout/sidebar/sidebar";

interface AddProjectPageProps extends Authenticated {
  params: Promise<{
    id: string;
  }>;
}

const Page = async ({ params, user }: AddProjectPageProps) => {
  const { id } = await params;

  const project = await getProjectById({
    id,
    userId: user.id!,
  });

  if (!project) {
    redirect("/project/add");
  }

  return (
    <>
      <Sidebar user={user} />
      <div className="h-svh flex flex-col justify-center w-full stretch">
        <Header.Container>
          <Header.Left>
            <Logo />
            <NewChatHeader />
          </Header.Left>
          <Header.Right>
            <ThemeToggle />
          </Header.Right>
        </Header.Container>
        <ProjectFormContainer project={project} mode="create" />
      </div>
    </>
  );
};

export default withAuth(Page);
