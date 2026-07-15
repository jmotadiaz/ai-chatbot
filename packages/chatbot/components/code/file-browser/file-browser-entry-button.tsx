"use client";

import { FolderTree } from "lucide-react";
import { useFileBrowser } from "./file-browser-provider";
import { Button } from "@/components/ui/button";

export const FileBrowserEntryButton: React.FC = () => {
  const { actions } = useFileBrowser();
  return (
    <Button
      variant="icon"
      size="icon"
      type="button"
      aria-label="Browse project files"
      title="Browse project files"
      onClick={actions.open}
    >
      <FolderTree size={18} />
    </Button>
  );
};
