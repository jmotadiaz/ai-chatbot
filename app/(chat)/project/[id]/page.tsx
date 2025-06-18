import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProjectById } from "@/lib/db/queries";
import { ChatProvider } from "@/app/providers";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider } from "../../../providers";
import Chat from "@/components/chat-with-client-storage";
import { chatModelId } from "@/lib/ai/providers";
import { ModelPicker } from "@/components/model-picker";
import { Sidebar } from "../../sidebar";

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
  const project = await getProjectById(id);

  if (!project) {
    redirect("/project/new");
  }

  if (project.userId !== session.user.id) {
    redirect("/");
  }

  return (
    <ChatProvider
      projectId={project.id}
      selectedModel={(project.defaultModel as chatModelId) || undefined}
      temperature={project.defaultTemperature || undefined}
      topP={project.defaultTopP || undefined}
      systemPrompt={project.systemPrompt}
      metaPrompt={project.metaPrompt}
      title={project.name}
    >
      <SidebarProvider>
        <div className="h-svh flex flex-col justify-center w-full stretch">
          <Sidebar projectId={id} />
          <Header.Container>
            <Header.Left>
              <Logo />
              <NewChat />
              <ModelPicker />
            </Header.Left>
            <Header.Right>
              <ThemeToggle />
            </Header.Right>
          </Header.Container>
          <Chat />
        </div>
      </SidebarProvider>
    </ChatProvider>
  );
};

export default ProjectPage;
