import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { getProjectById, getChats } from "@/lib/db/queries";
import { ChatProvider } from "@/app/providers";
import { Sidebar, SidebarContent, SidebarFooter } from "@/components/sidebar";
import { ChatList } from "@/components/chat-list";
import { UserMenu } from "@/components/user-menu";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProjectList } from "@/components/project-list";
import { SidebarProvider } from "../../../providers";
import Chat from "@/components/chat-with-client-storage";
import { modelID } from "@/lib/ai/providers";
import { ModelPicker } from "@/components/model-picker";

interface ProjectPageProps {
  params: Promise<{
    id: string;
  }>;
}

const ProjectPage: React.FC<ProjectPageProps> = async ({ params }) => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const project = await getProjectById({ id });

  if (!project) {
    notFound();
  }

  if (project.userId !== session.user.id) {
    redirect("/");
  }

  const { chats } = await getChats({
    userId: session.user.id,
    projectId: id,
    limit: 10,
  });

  return (
    <ChatProvider
      projectId={project.id}
      selectedModel={(project.defaultModel as modelID) || undefined}
      temperature={project.defaultTemperature || undefined}
      topP={project.defaultTopP || undefined}
      systemPrompt={project.systemPrompt}
      title={project.name}
    >
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
          <Header>
            <div className="flex flex-row items-center gap-6 shrink-0">
              <Logo />
              <NewChat />
              <ModelPicker />
            </div>
            <div className="flex flex-row items-center gap-2 shrink-0">
              <ThemeToggle />
            </div>
          </Header>
          <Chat />
        </div>
      </SidebarProvider>
    </ChatProvider>
  );
};

export default ProjectPage;
