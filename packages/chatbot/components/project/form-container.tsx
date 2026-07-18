import { ProjectForm } from "@/components/project/form";
import { ProjectResourcesLoader } from "@/components/project/resources-loader";
import type { Project } from "@/lib/features/project/types";

interface ProjectFormContainerProps {
  project?: Project;
  mode?: "create" | "edit";
}

export const ProjectFormContainer: React.FC<ProjectFormContainerProps> = ({
  project,
  mode,
}) => {
  if (!project?.id) {
    return <ProjectForm project={project} mode={mode} />;
  }

  return (
    <ProjectForm
      project={project}
      mode={mode}
      resourcesSlot={<ProjectResourcesLoader projectId={project.id} />}
    />
  );
};
