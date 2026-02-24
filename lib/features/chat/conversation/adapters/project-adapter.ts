import { ProjectPort } from "@/lib/features/chat/conversation/ports";
import { getProjectById } from "@/lib/features/project/queries";

export const chatProjectAdapter: ProjectPort = {
  getProjectById: async ({ id, userId }) => {
    const project = await getProjectById({ id, userId });
    return project || undefined;
  },
};
