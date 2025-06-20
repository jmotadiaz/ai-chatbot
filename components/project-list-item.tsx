"use client";

import { startTransition, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useCollapse } from "react-collapsed";
import { cn } from "@/lib/utils";
import Link from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";

export interface ProjectListItemProps {
  id: string;
  currentProjectId?: string | null | undefined;
  name: string;
  chatList: React.ReactNode;
  deleteProject: () => void;
}

export const ProjectListItem: React.FC<ProjectListItemProps> = ({
  id,
  name,
  chatList,
  currentProjectId,
  deleteProject,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { getCollapseProps, getToggleProps, isExpanded } = useCollapse({
    defaultExpanded: id === currentProjectId,
  });
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center justify-between p-2 text-sm font-medium cursor-pointer select-none rounded-lg border dark:border-zinc-600  hover:bg-accent transition-colors"
        {...getToggleProps()}
      >
        <span>{name}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform duration-300",
            isExpanded && "rotate-180"
          )}
        />
      </div>
      <div {...getCollapseProps()}>
        <div className="flex flex-col ml-2 pl-4 my-2 border-l-2 border-zinc-300 dark:border-zinc-600">
          <div className="flex space-x-2">
            <Link href={`/project/${id}`}>
              <Button variant="outline">Chat</Button>
            </Link>
            <Link href={`/project/${id}/edit`}>
              <Button variant="outline">Edit</Button>
            </Link>
            <Button
              variant="outline"
              onClick={() =>
                startTransition(() => {
                  setIsModalOpen(true);
                })
              }
            >
              Delete
            </Button>
          </div>
          {chatList}
        </div>
      </div>
      <ConfirmModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={() => {
          deleteProject();
        }}
        title="Delete Project"
        message={`Are you sure you want to delete the project "${name}"? This action cannot be undone.`}
      />
    </div>
  );
};
