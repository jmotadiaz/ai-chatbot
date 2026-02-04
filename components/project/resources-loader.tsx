import { ProjectResourcesTab } from "@/components/project/project-resources-tab";
import {
  getProjectResourcesAction,
  getUserResourcesNotInProjectAction,
} from "@/lib/features/rag/actions";

export const ProjectResourcesLoader = async ({
  projectId,
}: {
  projectId: string;
}) => {
  const [projectResourcesData, availableResourcesData] = await Promise.all([
    getProjectResourcesAction({
      projectId,
      limit: 20,
      offset: 0,
    }),
    getUserResourcesNotInProjectAction({
      projectId,
      limit: 20,
      offset: 0,
    }),
  ]);

  return (
    <ProjectResourcesTab
      key={projectId}
      projectId={projectId}
      initialProjectResources={projectResourcesData.resources}
      initialProjectHasMore={projectResourcesData.hasMore}
      initialAvailableResources={availableResourcesData.resources}
      initialAvailableHasMore={availableResourcesData.hasMore}
    />
  );
};
