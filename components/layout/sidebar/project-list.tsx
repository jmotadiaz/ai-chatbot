import type { ClassNameValue } from "tailwind-merge";
import { CirclePlus, Edit } from "lucide-react";
import { User } from "next-auth";
import { Item } from "@/components/ui/item";
import ChatLink from "@/components/chat/link";
import { ProjectListItem } from "@/components/layout/sidebar/project-list-item";
import { ChatList } from "@/components/layout/sidebar/chat-list";
import { cn } from "@/lib/utils/helpers";
import { getProjectsByUserId } from "@/lib/features/project/queries";
import { SidebarSectionTitle } from "@/components/layout/sidebar/section-title";

export interface ProjectListProps {
  limit?: number;
  className?: ClassNameValue;
  currentProjectId?: string | null | undefined;
  chatId?: string | null | undefined;
  user: User;
}

export const ProjectList: React.FC<ProjectListProps> = async ({
  className,
  limit = 10,
  currentProjectId,
  chatId,
  user,
}) => {
  const projects = await getProjectsByUserId({
    userId: user.id!,
    joinChats: true,
    limit,
  });

  return (
    <div className={cn("my-4", className)}>
      <ChatLink href="/project/add">
        <SidebarSectionTitle>
          Projects <CirclePlus className="h-4 w-4 ml-3" />
        </SidebarSectionTitle>
      </ChatLink>
      <div role="list" className="space-y-1">
        <ChatLink href="/english-helper">
          <Item>English Helper</Item>
        </ChatLink>
        <ChatLink href="/image-editor">
          <Item>Image Editor</Item>
        </ChatLink>
        {projects.length > 0 && (
          <>
            {projects.map((project) => (
              <ProjectListItem
                key={project.id}
                id={project.id}
                name={project.name}
                currentProjectId={currentProjectId}
                chatList={<ChatList chats={project.chats} chatId={chatId} />}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export const ProjectListLoading: React.FC<{ className?: ClassNameValue }> = ({
  className,
}) => {
  return (
    <div className={cn("my-4", className)}>
      <div className="text-base flex items-center font-semibold text-zinc-500 dark:text-zinc-300 mb-4">
        Projects <Edit className="h-5 w-5 ml-2" />
      </div>
      <div className="space-y-1">
        <div className="block p-2 text-sm font-semibold cursor-pointer select-none rounded-lg border dark:border-zinc-600 hover:bg-accent transition-colors">
          English Helper
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex">
            <div className="h-5 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse flex-1 mr-3" />
            <div className="h-4 w-4 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
};
