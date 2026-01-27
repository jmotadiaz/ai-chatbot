import { redirect } from "next/navigation";
import { createEmptyProject } from "@/lib/features/project/actions";
import { withAuth, Authenticated } from "@/lib/features/auth/with-auth/hoc";

const AddProjectPage: React.FC<Authenticated> = async () => {
  const project = await createEmptyProject();
  redirect(`/project/${project.id}/add`);
};

export default withAuth(AddProjectPage);
