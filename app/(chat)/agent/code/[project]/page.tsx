import { notFound } from "next/navigation";
import { SessionList } from "@/components/agent-code/session-list";
import {
  getCodingAgentSessions,
  createCodingAgentSession,
} from "@/lib/features/agent-code/actions";

export default async function CodingAgentSessionsPage({
  params,
}: {
  params: { project: string };
}) {
  if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
  const sessions = await getCodingAgentSessions(params.project);

  async function createSession() {
    "use server";
    const session = await createCodingAgentSession(params.project);
    return session.sessionId;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{params.project}</h1>
      <SessionList
        project={params.project}
        sessions={sessions}
        onCreateSession={createSession}
      />
    </div>
  );
}
