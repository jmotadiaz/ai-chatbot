"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";
import Link from "next/link";
import { Button } from "./ui/button";

export interface ProjectListItemProps {
  id: string;
  name: string;
  chatList: React.ReactNode;
}

export const ProjectListItem: React.FC<ProjectListItemProps> = ({
  id,
  name,
  chatList,
}) => {
  const [showProjectDetails, setShowProjectDetails] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center justify-between text-sm font-medium cursor-pointer"
        onClick={() => setShowProjectDetails(!showProjectDetails)}
      >
        <span>{name}</span>
        <ChevronDown
          className={cn("h-4 w-4", showProjectDetails && "rotate-180")}
        />
      </div>
      <div
        className={cn(
          "flex flex-col gap-2 pl-4 my-2 ml-2 border-l-2 border-zinc-300 dark:border-zinc-600",
          showProjectDetails ? "block" : "hidden"
        )}
      >
        <Link href={`/project/${id}`}>
          <Button variant="outline">New Chat</Button>
        </Link>
        <Link href={`/project/${id}/edit`} className="ml-2">
          <Button variant="outline">Edit</Button>
        </Link>
        {chatList}
      </div>
    </div>
  );
};
