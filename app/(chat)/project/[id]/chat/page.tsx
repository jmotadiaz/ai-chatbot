import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { saveChat, transaction } from "@/lib/db/queries";
import { defaultModel } from "@/lib/ai/models/definition";

interface ProjectPageProps {
  params: Promise<{
    id: string;
  }>;
}

const Page: React.FC<ProjectPageProps> = async ({ params }) => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const { id } = await params;
  const [chat] = await transaction(
    saveChat({ userId: session.user.id, defaultModel, projectId: id })
  );
  redirect(`/${chat.id}`);
};

export default Page;
