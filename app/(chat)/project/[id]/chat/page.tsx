import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChatComposition } from "@/app/(chat)/chat-composition";

interface ProjectPageProps {
  params: Promise<{
    id: string;
  }>;
}

const Page: React.FC<ProjectPageProps> = async ({ params }) => {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <ChatComposition projectId={id} />;
};

export default Page;
