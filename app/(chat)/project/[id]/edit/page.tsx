import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProjectForm } from "@/components/project-form";
import { Sidebar, SidebarContent, SidebarFooter } from "@/components/sidebar";
import { ChatList } from "@/components/chat-list";
import { UserMenu } from "@/components/user-menu";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProjectList } from "@/components/project-list";
import { getChats, getProjectById } from "@/lib/db/queries";
import { SidebarProvider } from "../../../../providers";

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

  const { chats } = await getChats({
    userId: session.user.id,
    limit: 10,
    projectId: project.id,
  });

  return (
    <SidebarProvider>
      <div className="h-svh flex flex-col justify-center w-full stretch">
        <Sidebar>
          <Suspense fallback={null}>
            <SidebarContent>
              <ProjectList />
              <ChatList chats={chats} />
            </SidebarContent>
            <SidebarFooter>
              <UserMenu />
            </SidebarFooter>
          </Suspense>
        </Sidebar>
        <Header.Container>
          <Header.Left>
            <Logo />
            <NewChat />
          </Header.Left>
          <Header.Right>
            <ThemeToggle />
          </Header.Right>
        </Header.Container>
        <ProjectForm project={project} />
      </div>
    </SidebarProvider>
  );
};

export default EditProjectPage;
