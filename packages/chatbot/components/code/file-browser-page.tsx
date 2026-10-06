"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import {
  FileBrowserProvider,
  useFileBrowser,
} from "./file-browser/file-browser-provider";
import { FileBrowserView } from "./file-browser/file-browser-view";
import { initialLocationFrom } from "@/lib/features/code/file-browser/file-links";
import type { FileBrowserInitialLocation } from "@/lib/features/code/file-browser/file-links";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { Main } from "@/components/ui/main";
import { buttonVariants } from "@/components/ui/button";

export interface FileBrowserPageProps {
  project: string;
  sessionId: string;
  initialLocation?: FileBrowserInitialLocation;
}

/**
 * The provider reads the deep link only on mount (to protect pending
 * comments), so same-route query changes — note links, browser back/forward —
 * are re-applied to live state here.
 */
const DeepLinkSync: React.FC = () => {
  const searchParams = useSearchParams();
  const { actions } = useFileBrowser();
  const location = useMemo(
    () => initialLocationFrom(Object.fromEntries(searchParams.entries())),
    [searchParams],
  );

  useEffect(() => {
    actions.applyLocation(location);
  }, [location, actions]);

  return null;
};

export const FileBrowserPage: React.FC<FileBrowserPageProps> = ({
  project,
  sessionId,
  initialLocation,
}) => (
  <FileBrowserProvider
    project={project}
    sessionId={sessionId}
    initialLocation={initialLocation}
  >
    <DeepLinkSync />
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
