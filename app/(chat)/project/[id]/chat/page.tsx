import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChatComposition } from "@/app/(chat)/chat-composition";

interface ProjectPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const Page: React.FC<ProjectPageProps> = async ({ params, searchParams }) => {
  const { id } = await params;
  const { chatId } = await searchParams;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (chatId) {
    redirect(`/${chatId}`);
  }

  return <ChatComposition projectId={id} />;
};

export default Page;
