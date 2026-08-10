import { notFound } from "next/navigation";
import { getTraceLogger } from "tracing";
import {
  AgentCodeChatLayout,
  type ModelThinking,
} from "@/components/code/agent-code-chat-layout";
import {
  getCodingAgentModels,
} from "@/lib/features/code/actions";
import { loadCodingAgentSnapshot } from "@/lib/features/code/snapshot-loader";
import type { SessionSnapshot } from "@/lib/features/code/hooks/use-coding-agent";
import {
  withAuth,
  type Authenticated,
} from "@/lib/features/auth/with-auth/hoc";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ClientErrorWrapper } from "@/components/code/client-error-wrapper";

/**
 * Fetch the session's opening state on the server.
 *
 * This is the same worker RPC the `/snapshot` route makes, through the same
 * authorization helper, so the worker stays the single authority for both the
 * messages and the cursor they resume from. Rendering it server-side only
 * changes who asks, and it removes a round trip that the rest of the session's
 * startup (skills, prompts) is sequenced behind.
 *
 * Any failure degrades to client-side loading rather than failing the page:
 * the hook falls back to its own fetch, which reports the error the way it
 * always has.
 */
async function loadInitialSnapshot(
  userId: string,
  sessionId: string,
): Promise<SessionSnapshot | null> {
  try {
    const result = await loadCodingAgentSnapshot({ userId, sessionId });
    return result.ok ? (result.snapshot as SessionSnapshot) : null;
  } catch (err) {
    getTraceLogger("bridge").warn("page.snapshot_ssr_failed", {
      sessionId,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function CodingAgentChatPage({
  params,
  user,
}: {
  params: Promise<{ project: string; sessionId: string }>;
} & Authenticated) {
  if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
  const { project, sessionId } = await params;
  const [models, initialSnapshot] = await Promise.all([
    getCodingAgentModels(),
    loadInitialSnapshot(user.id!, sessionId),
  ]);
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
          initialSnapshot={initialSnapshot}
        />
      </ClientErrorWrapper>
    </>
  );
}

export default withAuth(CodingAgentChatPage);
