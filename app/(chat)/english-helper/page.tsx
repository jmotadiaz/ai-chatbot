import React from "react";
import { SidebarProvider } from "../../providers";
import { Sidebar } from "../sidebar";
import { AuthCheck } from "@/components/auth-check";
import { EnglishHelper } from "@/app/(chat)/english-helper/component";

const Page: React.FC = async () => {
  return (
    <SidebarProvider>
      <AuthCheck />
      <Sidebar />
      <EnglishHelper />
    </SidebarProvider>
  );
};

export default Page;
