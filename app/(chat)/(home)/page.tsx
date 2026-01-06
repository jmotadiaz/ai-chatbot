import { redirect } from "next/navigation";
import { auth } from "@/lib/features/auth/auth-config";
import { ChatLayout } from "@/app/(chat)/chat-layout";

export interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const Page: React.FC<PageProps> = async ({ searchParams }) => {
  const { chatId } = await searchParams;
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  if (chatId) {
    redirect(`/${chatId}`);
  }

  return <ChatLayout />;
};

export default Page;
