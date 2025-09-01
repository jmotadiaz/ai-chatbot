import React from "react";
import { Sidebar } from "../sidebar";
import { AuthCheck } from "@/components/auth-check";
import { EnglishHelper } from "@/app/(chat)/english-helper/component";

const Page: React.FC = async () => {
  return (
    <>
      <AuthCheck />
      <Sidebar />
      <EnglishHelper />
    </>
  );
};

export default Page;
