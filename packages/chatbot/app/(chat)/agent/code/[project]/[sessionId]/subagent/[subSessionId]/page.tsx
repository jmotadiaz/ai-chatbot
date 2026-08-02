import { notFound } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ClientErrorWrapper } from "@/components/code/client-error-wrapper";
import { SubagentSessionView } from "@/components/code/subagent-session-view";
import { withAuth, type Authenticated } from "@/lib/features/auth/with-auth/hoc";

async function SubagentSessionPage({
  params,
  searchParams,
  user,
}: {
  params: Promise<{ project: string; sessionId: string; subSessionId: string }>;
  searchParams: Promise<{ pi?: string }>;
} & Authenticated) {
  if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
  const { project, sessionId, subSessionId } = await params;
  const { pi } = await searchParams;
  return (
    <>
      <Sidebar user={user} />
      <ClientErrorWrapper sessionId={subSessionId}>
        <SubagentSessionView
          project={project}
          parentSessionId={sessionId}
          subSessionId={subSessionId}
          subPiSessionId={pi}
        />
      </ClientErrorWrapper>
    </>
  );
}

export default withAuth(SubagentSessionPage);
