import { notFound } from "next/navigation";
import { AgentCodeChatLayout } from "@/components/agent-code/agent-code-chat-layout";
import { getCodingAgentModels } from "@/lib/features/agent-code/actions";
import { withAuth, type Authenticated } from "@/lib/features/auth/with-auth/hoc";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ClientErrorWrapper } from "@/components/agent-code/client-error-wrapper";

async function CodingAgentChatPage({
  params,
  user,
}: {
  params: Promise<{ project: string; sessionId: string }>;
} & Authenticated) {
  if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
  const { project, sessionId } = await params;
  const models = await getCodingAgentModels();
  return (
    <>
      <Sidebar user={user} />
      <ClientErrorWrapper sessionId={sessionId}>
        <AgentCodeChatLayout
          project={project}
          sessionId={sessionId}
          availableModels={models}
        />
      </ClientErrorWrapper>
    </>
  );
}

export default withAuth(CodingAgentChatPage);
