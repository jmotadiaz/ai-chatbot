import { notFound } from "next/navigation";
import { AgentCodeChatLayout } from "@/components/code/agent-code-chat-layout";
import {
  getCodingAgentModels,
  getCodingAgentMessages,
  getCodingAgentStatus,
} from "@/lib/features/code/actions";
import {
  withAuth,
  type Authenticated,
} from "@/lib/features/auth/with-auth/hoc";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ClientErrorWrapper } from "@/components/code/client-error-wrapper";

async function CodingAgentChatPage({
  params,
  user,
}: {
  params: Promise<{ project: string; sessionId: string }>;
} & Authenticated) {
  if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
  const { project, sessionId } = await params;
  const [models, initialMessages, status] = await Promise.all([
    getCodingAgentModels(),
    getCodingAgentMessages(project, sessionId),
    getCodingAgentStatus(sessionId),
  ]);
  return (
    <>
      <Sidebar user={user} />
      <ClientErrorWrapper sessionId={sessionId}>
        <AgentCodeChatLayout
          project={project}
          sessionId={sessionId}
          availableModels={models}
          initialMessages={initialMessages}
          isInitiallyRunning={status.running}
        />
      </ClientErrorWrapper>
    </>
  );
}

export default withAuth(CodingAgentChatPage);
