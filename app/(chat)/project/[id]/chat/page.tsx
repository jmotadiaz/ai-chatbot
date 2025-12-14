import { redirect } from "next/navigation";
import { auth } from "@/lib/features/auth/auth-config";
import { ChatComposition } from "@/app/(chat)/chat-composition";

interface ProjectPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const Page: React.FC<ProjectPageProps> = async ({ params, searchParams }) => {
  const { id } = await params;
  const { chatId, chatType } = await searchParams;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (chatId) {
    redirect(`/${chatId}`);
  }

  const chatTypeValue = Array.isArray(chatType) ? chatType[0] : chatType;

  return (
    <ChatComposition projectId={id} temporary={chatTypeValue === "temporary"} />
  );
};

export default Page;
