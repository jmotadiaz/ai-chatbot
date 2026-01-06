import React from "react";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ChatHubComponent } from "@/app/(chat)/chat/hub/component";
import { AuthCheck } from "@/components/auth/check";

const HubPage: React.FC = async () => {

  return <>
    <AuthCheck />
    <Sidebar />
    <ChatHubComponent />
  </>;
};

export default HubPage;


