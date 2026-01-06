import { redirect } from "next/navigation";
import { ChatLayout } from "@/app/(chat)/chat-layout";
import { ResourceOwnerCheck } from "@/components/auth/resource-owner-check";

interface ProjectPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const Page: React.FC<ProjectPageProps> = async ({ params, searchParams }) => {
  const { id } = await params;
  const { chatId } = await searchParams;

  if (chatId) {
    redirect(`/${chatId}`);
  }

  return (
    <>
      <ResourceOwnerCheck projectId={id} />
      <ChatLayout projectId={id} />
    </>
  );
};

export default Page;
