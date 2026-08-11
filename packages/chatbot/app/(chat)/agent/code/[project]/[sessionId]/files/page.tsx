import { notFound } from "next/navigation";
import { config } from "config";
import { FileBrowserPage } from "@/components/code/file-browser-page";
import {
  withAuth,
  type Authenticated,
} from "@/lib/features/auth/with-auth/hoc";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ClientErrorWrapper } from "@/components/code/client-error-wrapper";
import { isSafeRelativePath } from "@/lib/features/code/file-browser/file-links";
import type { FileBrowserInitialLocation } from "@/components/code/file-browser/file-browser-provider";

function initialLocationFrom(searchParams: {
  scope?: string | string[];
  file?: string | string[];
}): FileBrowserInitialLocation {
  const { scope, file } = searchParams;
  return {
    ...(scope === "uncommitted" || scope === "tree" ? { scope } : {}),
    ...(typeof file === "string" && isSafeRelativePath(file) ? { file } : {}),
  };
}

async function CodingAgentFilesPage({
  params,
  searchParams,
  user,
}: {
  params: Promise<{ project: string; sessionId: string }>;
  searchParams: Promise<{ scope?: string | string[]; file?: string | string[] }>;
} & Authenticated) {
  if (!config.codingAgentEnabled()) return notFound();
  const { project, sessionId } = await params;
  const initialLocation = initialLocationFrom(await searchParams);
  return (
    <>
      <Sidebar user={user} />
      <ClientErrorWrapper sessionId={sessionId}>
        <FileBrowserPage
          project={project}
          sessionId={sessionId}
          initialLocation={initialLocation}
        />
      </ClientErrorWrapper>
    </>
  );
}

export default withAuth(CodingAgentFilesPage);
