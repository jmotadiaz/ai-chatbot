"use client";

import Link from "next/link";

export interface ProjectListProps {
  projects: string[];
}

export const ProjectList: React.FC<ProjectListProps> = ({ projects }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {projects.map((project) => (
        <Link
          key={project}
          href={`/agent/code/${encodeURIComponent(project)}`}
          className="block p-6 border rounded-lg hover:bg-accent transition-colors"
        >
          <h3 className="font-semibold text-lg">{project}</h3>
        </Link>
      ))}
    </div>
  );
};
