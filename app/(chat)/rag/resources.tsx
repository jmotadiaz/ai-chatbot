import { RAGResources } from "@/components/rag-resources";
import { auth } from "@/lib/features/auth/auth-config";
import { getRagResourcesAction } from "@/lib/features/rag/actions";
export const Resources: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const { resources, hasMore } = await getRagResourcesAction({
    limit: 20,
    offset: 0,
  });

  return <RAGResources initialResources={resources} initialHasMore={hasMore} />;
};
