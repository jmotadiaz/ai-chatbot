import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/features/auth/auth-config";
import { getChatById } from "@/lib/features/chat/queries";
import { getProjectById } from "@/lib/features/project/queries";

interface ResourceOwnerCheckProps {
  chatId?: string;
  projectId?: string;
}

const _ResourceOwnerCheck: React.FC<ResourceOwnerCheckProps> = async ({
  chatId,
  projectId,
}) => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  if (chatId) {
    const chat = await getChatById(chatId);
    if (!chat || chat.userId !== session.user.id) {
      redirect("/");
    }
  }

  if (projectId) {
    const project = await getProjectById(projectId);
    if (!project || project.userId !== session.user.id) {
      redirect("/");
    }
  }

  return null;
};

export const ResourceOwnerCheck: React.FC<ResourceOwnerCheckProps> = ({
  chatId,
  projectId,
}) => {
  return (
    <Suspense fallback={null}>
      <_ResourceOwnerCheck chatId={chatId} projectId={projectId} />
    </Suspense>
  );
};

