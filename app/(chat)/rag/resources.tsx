import { RAGResources } from "@/components/rag-resources";
import { auth } from "@/lib/features/auth/auth-config";
import { getUniqueResourceTitlesByUserId } from "@/lib/features/rag/queries";
export const Resources: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const resources = await getUniqueResourceTitlesByUserId(session.user.id);

  return <RAGResources resources={resources} />;
};
