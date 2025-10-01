import { redirect } from "next/navigation";
import { auth } from "@/auth";
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

  console.log("chatId from searchParams:", chatId);
  if (chatId) {
    redirect(`/${chatId}`);
  }

  return <ChatComposition />;
};

export default Page;
