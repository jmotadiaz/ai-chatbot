import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChatComposition } from "@/app/(chat)/chat-composition";

const Page: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return <ChatComposition />;
};

export default Page;
