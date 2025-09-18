import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { saveChat, transaction } from "@/lib/db/queries";
import { defaultModel } from "@/lib/ai/models/definition";

const Page: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const [chat] = await transaction(
    saveChat({ userId: session.user.id, defaultModel })
  );
  redirect(`/${chat.id}`);
};

export default Page;
