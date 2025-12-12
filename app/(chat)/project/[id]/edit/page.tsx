import { redirect } from "next/navigation";
import { Sidebar } from "../../../sidebar";
import { auth } from "@/lib/features/auth/auth-config";
import { ProjectForm } from "@/components/project-form";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChatHeader } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { getProjectById } from "@/lib/features/project/queries";

interface EditProjectPageProps {
  params: Promise<{
    id: string;
  }>;
}

const EditProjectPage: React.FC<EditProjectPageProps> = async ({ params }) => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    redirect("/project/new");
  }

  return (
    <>
      <div className="h-svh flex flex-col justify-center w-full stretch">
        <Sidebar projectId={id} />
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

export default EditProjectPage;
