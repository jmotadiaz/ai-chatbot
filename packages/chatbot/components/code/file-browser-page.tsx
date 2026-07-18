"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FileBrowserProvider } from "./file-browser/file-browser-provider";
import { FileBrowserView } from "./file-browser/file-browser-view";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { Main } from "@/components/ui/main";
import { buttonVariants } from "@/components/ui/button";

export interface FileBrowserPageProps {
  project: string;
  sessionId: string;
}

export const FileBrowserPage: React.FC<FileBrowserPageProps> = ({
  project,
  sessionId,
}) => (
  <FileBrowserProvider project={project} sessionId={sessionId}>
    <Header.Container>
      <Header.Left>
        <Logo />
        <Link
          href={`/agent/code/${project}/${sessionId}`}
          aria-label="Back to chat"
          title="Back to chat"
          className={buttonVariants({ variant: "icon", size: "icon" })}
        >
          <ArrowLeft size={18} />
        </Link>
        <span className="truncate text-sm font-medium">{project}</span>
      </Header.Left>
      <Header.Right>
        <ThemeToggle />
      </Header.Right>
    </Header.Container>
    <Main>
      <div className="h-full pt-16">
        <FileBrowserView />
      </div>
    </Main>
  </FileBrowserProvider>
);
