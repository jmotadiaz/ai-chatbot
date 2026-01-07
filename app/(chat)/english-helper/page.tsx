import React from "react";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { EnglishHelper } from "@/app/(chat)/english-helper/component";
import { withAuth, AuthenticatedPage } from "@/lib/features/auth/with-auth";

const Page: React.FC<AuthenticatedPage> = async ({ user }) => {
  return (
    <>
      <Sidebar user={user} />
      <EnglishHelper />
    </>
  );
};

export default withAuth(Page);
