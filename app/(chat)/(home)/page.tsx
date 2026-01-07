import { redirect } from "next/navigation";
import { ChatLayout } from "@/app/(chat)/chat-layout";
import { withAuth, AuthenticatedPage } from "@/lib/features/auth/with-auth";

export interface PageProps extends AuthenticatedPage {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const Page: React.FC<PageProps> = async ({ searchParams, user }) => {
  const { chatId } = await searchParams;

  if (chatId) {
    redirect(`/${chatId}`);
  }

  return (
    <>
      <ChatLayout user={user} />
    </>
  );
};

export default withAuth(Page);
