import { notFound } from "next/navigation";
import {
  AgentCodeChatLayout,
  type ModelThinking,
} from "@/components/code/agent-code-chat-layout";
import {
  getCodingAgentModels,
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
  const models = await getCodingAgentModels();
  const modelThinking = new Map<string, ModelThinking>(
    models.map((m): [string, ModelThinking] => [
      m.id,
      { levels: m.levels, defaultLevel: m.defaultLevel },
    ]),
  );
  return (
    <>
      <Sidebar user={user} />
      <ClientErrorWrapper sessionId={sessionId}>
        <AgentCodeChatLayout
          project={project}
          sessionId={sessionId}
          availableModels={models.map((m) => m.id)}
          modelThinking={modelThinking}
        />
      </ClientErrorWrapper>
    </>
  );
}

export default withAuth(CodingAgentChatPage);
