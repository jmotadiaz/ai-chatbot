import { redirect } from "next/navigation";
import { Sidebar } from "../../../sidebar";
import { auth } from "@/auth";
import { getProjectById } from "@/lib/db/queries";
import { ChatProvider } from "@/app/providers";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import Chat from "@/components/chat-with-client-storage";
import { chatModelId } from "@/lib/ai/models/definition";
import { defaultMetaPrompt } from "@/lib/ai/prompts";
import { filterTools } from "@/lib/ai/tools/utils";
import { SettingsSidebar } from "@/components/settings-sidebar";
import { SettingsToggleButton } from "@/components/settings-toggle-button";

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
      <div className="flex flex-1">
        <div className="flex-1 h-svh flex flex-col justify-center w-full stretch">
          <Sidebar projectId={id} />
          <Header.Container>
            <Header.Left>
              <Logo />
              <NewChat />
            </Header.Left>
            <Header.Right>
              <SettingsToggleButton />
              <ThemeToggle />
            </Header.Right>
          </Header.Container>
          <Chat />
        </div>
        <SettingsSidebar />
      </div>
    </ChatProvider>
  );
};

export default ProjectPage;
