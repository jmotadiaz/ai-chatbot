import React from "react";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ChatHubComponent } from "@/app/(chat)/chat/hub/component";
import { withAuth, Authenticated } from "@/lib/features/auth/with-auth/hoc";

const HubPage: React.FC<Authenticated> = async ({ user }) => {
  return (
    <>
      <Sidebar user={user} />
      <ChatHubComponent />
    </>
  );
};

export default withAuth(HubPage);
