import { notFound } from "next/navigation";
import { AgentCodeChatLayout } from "@/components/agent-code/agent-code-chat-layout";
import { getCodingAgentModels } from "@/lib/features/agent-code/actions";

export default async function CodingAgentChatPage({
  params,
}: {
  params: Promise<{ project: string; sessionId: string }>;
}) {
  if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
  const { project, sessionId } = await params;
  const models = await getCodingAgentModels();
  return (
    <AgentCodeChatLayout
      project={project}
      sessionId={sessionId}
      availableModels={models}
    />
  );
}
