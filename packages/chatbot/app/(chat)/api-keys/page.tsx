import React from "react";
import { APIKeysManager } from "./component";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { withAuth, Authenticated } from "@/lib/features/auth/with-auth/hoc";

const APIKeysPage: React.FC<Authenticated> = async ({ user }) => {
  return (
    <>
      <Sidebar user={user} />
      <APIKeysManager />
    </>
  );
};

export default withAuth(APIKeysPage);
