import React from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ChatHubComponent } from "@/app/(chat)/chat/hub/component";
import { auth } from "@/lib/features/auth/auth-config";

const HubPage: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return <>
    <Sidebar />
    <ChatHubComponent />
  </>;
};

export default HubPage;
