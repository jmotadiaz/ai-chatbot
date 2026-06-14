import { notFound } from "next/navigation";
import { AgentCodeChat } from "@/components/agent-code/agent-code-chat";
import { getCodingAgentModels } from "@/lib/features/agent-code/actions";

export default async function CodingAgentChatPage({
  params,
}: {
  params: { project: string; sessionId: string };
}) {
  if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
  const models = await getCodingAgentModels();
  return (
    <div className="h-full">
      <AgentCodeChat
        project={params.project}
        sessionId={params.sessionId}
        availableModels={models}
      />
    </div>
  );
}
