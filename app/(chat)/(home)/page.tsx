import { redirect } from "next/navigation";
import { ChatLayout } from "@/app/(chat)/chat-layout";
import { auth } from "@/lib/features/auth/auth-config";

export interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const Page: React.FC<PageProps> = async ({ searchParams }) => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { chatId } = await searchParams;

  if (chatId) {
    redirect(`/${chatId}`);
  }

  return (
    <>
      <ChatLayout />
    </>
  );
};

export default Page;
