import React from "react";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ChatHubComponent } from "@/app/(chat)/chat/hub/component";
import { withAuth, AuthenticatedPage } from "@/lib/features/auth/with-auth";

const HubPage: React.FC<AuthenticatedPage> = async ({ user }) => {
  return <>
    <Sidebar user={user} />
    <ChatHubComponent />
  </>;
};

export default withAuth(HubPage);
