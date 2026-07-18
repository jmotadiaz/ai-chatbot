import { notFound } from "next/navigation";
import { FileBrowserPage } from "@/components/code/file-browser-page";
import {
  withAuth,
  type Authenticated,
} from "@/lib/features/auth/with-auth/hoc";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ClientErrorWrapper } from "@/components/code/client-error-wrapper";

async function CodingAgentFilesPage({
  params,
  user,
}: {
  params: Promise<{ project: string; sessionId: string }>;
} & Authenticated) {
  if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
  const { project, sessionId } = await params;
  return (
    <>
      <Sidebar user={user} />
      <ClientErrorWrapper sessionId={sessionId}>
        <FileBrowserPage project={project} sessionId={sessionId} />
      </ClientErrorWrapper>
    </>
  );
}

export default withAuth(CodingAgentFilesPage);
