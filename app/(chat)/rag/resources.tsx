import { RAGResources } from "@/components/rag/resources";
import { getRagResourcesAction } from "@/lib/features/rag/actions";
import { AuthCheck } from "@/components/auth/check";

export const Resources: React.FC = async () => {
  const { resources, hasMore } = await getRagResourcesAction({
    limit: 20,
    offset: 0,
  });

  return (
    <>
      <AuthCheck />
      <RAGResources initialResources={resources} initialHasMore={hasMore} />
    </>
  );
};
