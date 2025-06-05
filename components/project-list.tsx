import Link from "next/link";
import { ClassNameValue } from "tailwind-merge";
import { auth } from "@/auth";
import { cn } from "@/lib/utils";
import { Edit, Edit2 } from "lucide-react";
import { getProjectsByUserId } from "@/lib/db/queries";

export interface ProjectListProps {
  limit?: number;
  className?: ClassNameValue;
}

export const ProjectList: React.FC<ProjectListProps> = async ({
  className,
  limit = 10,
}) => {
  const session = await auth();
  if (!session?.user) return null;

  const projects = await getProjectsByUserId({
    userId: session.user.id,
    limit,
  });

  return (
    <div className={cn("p-4", className)}>
      <h3 className="text-base flex items-center font-semibold text-zinc-500 dark:text-zinc-300 mb-4">
        Projects{" "}
        <Link href="/project/new" className="ml-3">
          <Edit className="h-5 w-5" />
        </Link>
      </h3>
      {projects.length > 0 && (
        <div className="space-y-2">
          {projects.map((project) => (
            <ProjectListItem
              key={project.id}
              id={project.id}
              name={project.name}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface ProjectListItemProps {
  id: string;
  name: string;
}

const ProjectListItem: React.FC<ProjectListItemProps> = ({ id, name }) => {
  return (
    <div className="flex items-center justify-between rounded-lg border dark:border-zinc-600 text-sm transition-colors hover:bg-accent group">
      <Link href={`/project/${id}`} className="flex-1 overflow-hidden">
        <div className="p-2 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
          {name}
        </div>
      </Link>
      <Link href={`/project/${id}/edit`} className="cursor-pointer p-2">
        <Edit2 className="h-4 w-4" />
      </Link>
    </div>
  );
};
