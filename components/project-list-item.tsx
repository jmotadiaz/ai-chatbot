"use client";

import { startTransition, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useCollapse } from "react-collapsed";
import { cn } from "@/lib/utils/helpers";
import ChatLink from "@/components/chat-link";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Item } from "@/components/ui/item";

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
      <Item className="cursor-pointer" {...getToggleProps()}>
        <div className="flex-1">{name}</div>
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform duration-300",
            isExpanded && "rotate-180"
          )}
        />
      </Item>
      <div {...getCollapseProps()}>
        <div className="flex flex-col ml-2 pl-4 my-2 border-l-2 border-zinc-300 dark:border-zinc-600">
          <div className="flex space-x-2">
            <ChatLink href={`/project/${id}/chat`}>
              <Button variant="outline">Chat</Button>
            </ChatLink>
            <ChatLink href={`/project/${id}/edit`}>
              <Button variant="outline">Edit</Button>
            </ChatLink>
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
