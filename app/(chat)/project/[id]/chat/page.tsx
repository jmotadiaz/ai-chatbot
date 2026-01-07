import { redirect } from "next/navigation";
import { ChatLayout } from "@/app/(chat)/chat-layout";
import { withAuth, AuthenticatedPage } from "@/lib/features/auth/with-auth";

interface ProjectPageProps extends AuthenticatedPage {
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
      <ChatLayout projectId={id} />
    </>
  );
};

export default withAuth(Page);
