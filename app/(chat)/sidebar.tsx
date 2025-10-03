import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  SidebarContent,
  Sidebar as SidebarComponent,
  SidebarFooter,
} from "@/components/sidebar";
import { ProjectList, ProjectListLoading } from "@/components/project-list";
import {
  ChatList,
  ChatListLoading,
  ChatListProps,
} from "@/components/chat-list";
import { UserMenu } from "@/components/user-menu";
import { RAGNav } from "@/components/rag-nav";
import { getChats } from "@/lib/db/queries";
import { NewChatSidebar } from "@/components/new-chat";

export interface SidebarProps {
  projectId?: string | null | undefined;
  chatId?: string | null | undefined;
}

export const Sidebar: React.FC<SidebarProps> = ({ projectId, chatId }) => {
  return (
    <SidebarComponent>
      <SidebarContent>
        <NewChatSidebar className="mb-3" />
        <RAGNav className="mb-6" />
        <Suspense fallback={<ProjectListLoading />}>
          <ProjectList currentProjectId={projectId} />
        </Suspense>
        <Suspense fallback={<ChatListLoading />}>
          <Chats chatId={chatId} />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      </SidebarFooter>
    </SidebarComponent>
  );
};

const Chats: React.FC<Omit<ChatListProps, "chats">> = async ({ chatId }) => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { chats } = await getChats({
    userId: session.user.id,
    limit: 20,
  });
  return <ChatList chats={chats} chatId={chatId} />;
};
