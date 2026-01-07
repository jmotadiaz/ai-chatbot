import React from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { auth } from "@/lib/features/auth/auth-config";
import { EnglishHelper } from "@/app/(chat)/english-helper/component";

const Page: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <Sidebar />
      <EnglishHelper />
    </>
  );
};

export default Page;
