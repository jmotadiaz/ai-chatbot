import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { config } from "config";
import {
  withAuth,
  type Authenticated,
} from "@/lib/features/auth/with-auth/hoc";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { Main } from "@/components/ui/main";
import { buttonVariants } from "@/components/ui/button";

async function CodingAgentArtifactPage({
  params,
  user,
}: {
  params: Promise<{ project: string; sessionId: string; artifact: string }>;
} & Authenticated) {
  if (!config.codingAgentEnabled()) return notFound();
  const { project, sessionId, artifact } = await params;

  return (
    <>
      <Sidebar user={user} />
      <Header.Container>
        <Header.Left>
          <Logo />
          <Link
            href={`/agent/code/${encodeURIComponent(project)}/${encodeURIComponent(sessionId)}`}
            aria-label="Back to chat"
            title="Back to chat"
            className={buttonVariants({ variant: "icon", size: "icon" })}
          >
            <ArrowLeft size={18} />
          </Link>
          <span className="truncate text-sm font-medium">
            {artifact}
          </span>
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <Main>
        <div className="h-full pt-16">
          <iframe
            src={`/api/agent/code/${encodeURIComponent(project)}/artifacts/${encodeURIComponent(artifact)}`}
            sandbox="allow-scripts allow-downloads allow-popups"
            className="size-full border-0"
          />
        </div>
      </Main>
    </>
  );
}

export default withAuth(CodingAgentArtifactPage);
