import React from "react";
import { SidebarContainer } from "@/components/layout/sidebar/container";
import { ChatHubComponent } from "@/app/(chat)/chat/hub/component";

const Loading: React.FC = () => {
  return <>
    <SidebarContainer />
    <ChatHubComponent />
  </>
};

export default Loading;


