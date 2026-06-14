import { notFound } from "next/navigation";
import { ProjectList } from "@/components/agent-code/project-list";
import { getCodingAgentProjects } from "@/lib/features/agent-code/actions";

export default async function CodingAgentProjectsPage() {
  if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
  const projects = await getCodingAgentProjects();
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Coding Agent</h1>
      <ProjectList projects={projects} />
    </div>
  );
}
