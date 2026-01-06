import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/features/auth/auth-config";
import { SidebarContainer } from "@/components/layout/sidebar/container";
import { SidebarContent } from "@/components/layout/sidebar/content";
import { SidebarFooter } from "@/components/layout/sidebar/footer";
import { ProjectList, ProjectListLoading } from "@/components/layout/sidebar/project-list";
import type { ChatListProps } from "@/components/layout/sidebar/chat-list";
import { ChatList, ChatListLoading } from "@/components/layout/sidebar/chat-list";
import { UserMenu } from "@/components/layout/sidebar/user-menu";
import { RAGNav } from "@/components/layout/sidebar/rag-nav";
import { getChats } from "@/lib/features/chat/queries";
import { NewChatSidebar } from "@/components/chat/new";

export interface SidebarProps {
  projectId?: string | null | undefined;
  chatId?: string | null | undefined;
}

export const Sidebar: React.FC<SidebarProps> = ({ projectId, chatId }) => {
  return (
    <SidebarContainer>
      <SidebarContent>
        <div className="flex flex-col gap-1">
          <NewChatSidebar />
          <RAGNav />
          <Suspense fallback={<ProjectListLoading className="my-0 mt-4" />}>
            <ProjectList
              className="my-0 mt-4"
              currentProjectId={projectId}
              chatId={chatId}
            />
          </Suspense>
          <Suspense fallback={<ChatListLoading className="my-0 mt-4" />}>
            <Chats chatId={chatId} className="my-0 mt-4" />
          </Suspense>
        </div>
      </SidebarContent>
      <SidebarFooter>
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      </SidebarFooter>
    </SidebarContainer>
  );
};

const Chats: React.FC<Omit<ChatListProps, "chats">> = async ({
  chatId,
  className,
}) => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { chats } = await getChats({
    userId: session.user.id,
    limit: 20,
  });
  return <ChatList chats={chats} chatId={chatId} className={className} />;
};
