import Link from "next/link";
import { ClassNameValue } from "tailwind-merge";
import { auth } from "@/auth";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

export interface ProjectListProps {
  limit?: number;
  className?: ClassNameValue;
}

export const ProjectList: React.FC<ProjectListProps> = async ({
  className,
}) => {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div className={cn("p-4", className)}>
      <Link
        href="/project/new"
        className="text-base flex items-center font-semibold text-zinc-600 dark:text-zinc-200 mb-4"
      >
        Create new project <Plus className="ml-2 h-4 w-4" />
      </Link>
      <h3 className="text-base font-semibold text-zinc-500 dark:text-zinc-300 mb-2">
        Projects
      </h3>
      {/* <div className="space-y-3"></div> */}
    </div>
  );
};

interface ProjectListItemProps {
  id: string;
  title?: string | null;
}

export const ProjectListItem: React.FC<ProjectListItemProps> = ({
  id,
  title,
}) => {
  return (
    <div className="flex items-center justify-between rounded-lg border dark:border-zinc-600 text-sm transition-colors hover:bg-accent group">
      <Link href={`/${id}`} className="flex-1 overflow-hidden">
        <div className="p-2 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
          {title || "Untitled Project"}
        </div>
      </Link>
    </div>
  );
};
