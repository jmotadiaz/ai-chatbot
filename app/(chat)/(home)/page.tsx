import { Sidebar } from "@/app/(chat)/sidebar";
import { AuthCheck } from "@/components/auth-check";
import { HomeChat } from "@/app/(chat)/(home)/component";

const Page: React.FC = async () => {
  return (
    <>
      <AuthCheck />
      <Sidebar />
      <HomeChat />
    </>
  );
};

export default Page;
