import { redirect } from "next/navigation";
import { Sidebar } from "../../../sidebar";
import { auth } from "@/auth";
import { getProjectById } from "@/lib/db/queries";
import { ChatProvider, SidebarProvider } from "@/app/providers";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import Chat from "@/components/chat-with-client-storage";
import { chatModelId } from "@/lib/ai/models/definition";
import { ModelPicker } from "@/components/model-picker";
import { defaultMetaPrompt } from "@/lib/ai/prompts";
import { filterTools } from "@/lib/ai/tools/utils";

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
      metaPrompt={project.hasPromptRefiner ? defaultMetaPrompt : null}
      title={project.name}
      tools={filterTools(project.tools || [])}
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
