import Link from "./ui/link";
import { ClassNameValue } from "tailwind-merge";
import { auth } from "@/auth";
import { cn } from "@/lib/utils";
import { Edit } from "lucide-react";
import { getProjectsByUserId } from "@/lib/db/queries";
import { ProjectListItem } from "./project-list-item";
import { ChatList } from "./chat-list";

export interface ProjectListProps {
  limit?: number;
  className?: ClassNameValue;
  currentProjectId?: string;
}

export const ProjectList: React.FC<ProjectListProps> = async ({
  className,
  limit = 10,
  currentProjectId,
}) => {
  const session = await auth();
  if (!session?.user) return null;

  const projects = await getProjectsByUserId({
    userId: session.user.id,
    joinChats: true,
    limit,
  });

  return (
    <div className={cn("my-4", className)}>
      <Link
        href="/project/new"
        className="text-base flex items-center font-semibold text-zinc-500 dark:text-zinc-300 mb-4"
      >
        Projects <Edit className="h-5 w-5 ml-2" />
      </Link>
      <div className="space-y-2">
        <Link
          href="/english-helper"
          className="block p-2 text-sm font-medium cursor-pointer select-none rounded-lg border dark:border-zinc-600  hover:bg-accent transition-colors"
        >
          English Helper
        </Link>
        {projects.length > 0 && (
          <>
            {projects.map((project) => (
              <ProjectListItem
                key={project.id}
                id={project.id}
                name={project.name}
                currentProjectId={currentProjectId}
                chatList={<ChatList chats={project.chats} />}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
};
