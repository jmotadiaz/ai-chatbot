import React from "react";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import {
  withAuth,
  type Authenticated,
} from "@/lib/features/auth/with-auth/hoc";
import { ChatLifecycleShell } from "@/components/chat/lifecycle-shell";
import { Context7ClientPage } from "@/components/chat/context7-client-page";
import { Main } from "@/components/ui/main";

const Context7Page: React.FC<Authenticated> = async ({ user }) => {
  return (
    <ChatLifecycleShell>
      <Sidebar user={user} />
      <Main>
        <Context7ClientPage />
      </Main>
    </ChatLifecycleShell>
  );
};

export default withAuth(Context7Page);
