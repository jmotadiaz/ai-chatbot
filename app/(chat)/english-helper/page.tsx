import React from "react";
import { Sidebar } from "../sidebar";
import { AuthCheck } from "@/components/auth-check";
import { EnglishHelper } from "@/app/(chat)/english-helper/component";
import { SettingsSidebar } from "@/components/settings-sidebar";

const Page: React.FC = async () => {
  return (
    <>
      <AuthCheck />
      <Sidebar />
      <div className="flex flex-1">
        <div className="flex-1">
          <EnglishHelper />
        </div>
        <SettingsSidebar />
      </div>
    </>
  );
};

export default Page;
