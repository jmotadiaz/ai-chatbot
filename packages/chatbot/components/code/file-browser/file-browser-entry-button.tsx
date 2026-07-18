"use client";

import Link from "next/link";
import { FolderTree } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export interface FileBrowserEntryButtonProps {
  project: string;
  sessionId: string;
}

export const FileBrowserEntryButton: React.FC<FileBrowserEntryButtonProps> = ({
  project,
  sessionId,
}) => (
  <Link
    href={`/agent/code/${project}/${sessionId}/files`}
    aria-label="Browse project files"
    title="Browse project files"
    className={buttonVariants({ variant: "icon", size: "icon" })}
  >
    <FolderTree size={18} />
  </Link>
);
