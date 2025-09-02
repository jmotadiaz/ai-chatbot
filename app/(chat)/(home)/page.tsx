import { Sidebar } from "@/app/(chat)/sidebar";
import { AuthCheck } from "@/components/auth-check";
import { HomeChat } from "@/app/(chat)/(home)/component";
import { SettingsSidebar } from "@/components/settings-sidebar";

const Page: React.FC = async () => {
  return (
    <>
      <AuthCheck />
      <Sidebar />
      <div className="flex flex-1">
        <div className="flex-1">
          <HomeChat />
        </div>
        <SettingsSidebar />
      </div>
    </>
  );
};

export default Page;
