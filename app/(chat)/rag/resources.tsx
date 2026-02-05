import { redirect } from "next/navigation";
import { RAGResources } from "@/components/rag/resources";
import { getRagResourcesAction } from "@/lib/features/rag/actions";
import { auth } from "@/lib/features/auth/auth-config";

export const Resources: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { items, hasMore } = await getRagResourcesAction({
    limit: 20,
    offset: 0,
  });

  return (
    <>
      <RAGResources initialResources={items} initialHasMore={hasMore} />
    </>
  );
};
