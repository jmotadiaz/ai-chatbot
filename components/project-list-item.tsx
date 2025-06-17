"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";
import Link from "./ui/link";
import { Button } from "./ui/button";
import { useCollapse } from "react-collapsed";

export interface ProjectListItemProps {
  id: string;
  currentProjectId?: string;
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
              <Button variant="outline">New Chat</Button>
            </Link>
            <Link href={`/project/${id}/edit`}>
              <Button variant="outline">Edit</Button>
            </Link>
            <Button variant="destructive" onClick={deleteProject}>
              Delete
            </Button>
          </div>
          {chatList}
        </div>
      </div>
    </div>
  );
};
