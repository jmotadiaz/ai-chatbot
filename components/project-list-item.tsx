"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";
import Link from "./ui/link-with-clear-session";
import { Button } from "./ui/button";
import { useCollapse } from "react-collapsed";

export interface ProjectListItemProps {
  id: string;
  currentProjectId?: string;
  name: string;
  chatList: React.ReactNode;
}

export const ProjectListItem: React.FC<ProjectListItemProps> = ({
  id,
  name,
  chatList,
  currentProjectId,
}) => {
  const { getCollapseProps, getToggleProps, isExpanded } = useCollapse({
    defaultExpanded: id === currentProjectId,
  });
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center justify-between text-sm font-medium cursor-pointer select-none"
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
          <div className="flex">
            <Link href={`/project/${id}`}>
              <Button variant="outline">New Chat</Button>
            </Link>
            <Link href={`/project/${id}/edit`} className="ml-2">
              <Button variant="outline">Edit</Button>
            </Link>
          </div>
          {chatList}
        </div>
      </div>
    </div>
  );
};
