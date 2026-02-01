import React from "react";
import { redirect } from "next/navigation";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { defaultWebSearchNumResults } from "@/lib/features/foundation-model/config";
import { getProjectById } from "@/lib/features/project/queries";
import { filterTools } from "@/lib/features/chat/utils";
import { ChatLayout } from "@/app/(chat)/chat-layout";
import { withAuth, Authenticated } from "@/lib/features/auth/with-auth/hoc";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ChatLifecycleShell } from "@/components/chat/lifecycle-shell";

interface ProjectPageProps extends Authenticated {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const Page: React.FC<ProjectPageProps> = async ({
  params,
  searchParams,
  user,
}) => {
  const { id } = await params;
  const { chatId } = await searchParams;

  if (chatId) {
    redirect(`/chat/${chatId}`);
  }

  const project = await getProjectById({
    id,
    userId: user.id!,
  });

  if (!project || project.userId !== user.id) {
    redirect("/project/add");
  }

  if (!project.isActive) {
    redirect(`/project/${project.id}/add`);
  }

  return (
    <ChatLifecycleShell>
      <Sidebar projectId={id} user={user} />
      <ChatLayout
        chatConfig={{
          projectId: id,
          selectedModel: (project.defaultModel as chatModelId) || undefined,
          temperature: project.defaultTemperature ?? undefined,
          topP: project.defaultTopP ?? undefined,
          topK: project.defaultTopK ?? undefined,
          systemPrompt: project.systemPrompt,
          refinePromptMode: project.hasPromptRefiner ? "project" : undefined,
          title: project.name,
          tools: filterTools(project.tools || []),
          webSearchNumResults:
            project.webSearchNumResults ?? defaultWebSearchNumResults,
        }}
      />
    </ChatLifecycleShell>
  );
};

export default withAuth(Page);
