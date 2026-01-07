import React from "react";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { EnglishHelper } from "@/app/(chat)/english-helper/component";
import { withAuth, Authenticated } from "@/lib/features/auth/with-auth/hoc";

const Page: React.FC<Authenticated> = async ({ user }) => {
  return (
    <>
      <Sidebar user={user} />
      <EnglishHelper />
    </>
  );
};

export default withAuth(Page);
