import { Suspense } from "react";
import { SidebarProvider } from "@/app/providers";
import { Sidebar } from "@/app/(chat)/sidebar";
import { AuthCheck } from "@/components/auth-check";
import { HomeChat } from "@/app/(chat)/(home)/component";

const Page: React.FC = async () => {
  return (
    <SidebarProvider>
      <Suspense fallback={null}></Suspense>
      <AuthCheck />
      <Sidebar />
      <HomeChat />
    </SidebarProvider>
  );
};

export default Page;
