import { redirect } from "next/navigation";
import { auth } from "@/lib/features/auth/auth-config";
import { ChatComposition } from "@/app/(chat)/chat-composition";

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

  return <ChatComposition />;
};

export default Page;
