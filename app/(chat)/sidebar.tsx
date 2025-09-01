import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { Edit } from "lucide-react";
import { auth } from "@/auth";
import {
  SidebarContent,
  Sidebar as SidebarComponent,
  SidebarFooter,
  SidebarSectionTitle,
} from "@/components/sidebar";
import { ProjectList, ProjectListLoading } from "@/components/project-list";
import { ChatList, ChatListLoading } from "@/components/chat-list";
import { UserMenu } from "@/components/user-menu";
import { RAGNav } from "@/components/rag-nav";
import { getChats } from "@/lib/db/queries";
import Link from "@/components/ui/link";

export interface SidebarProps {
  projectId?: string | null | undefined;
}

export const Sidebar: React.FC<SidebarProps> = ({ projectId }) => {
  return (
    <SidebarComponent>
      <SidebarContent>
        <Link href="/">
          <SidebarSectionTitle>
            New Chat <Edit className="h-4 w-4 ml-2" />
          </SidebarSectionTitle>
        </Link>
        <RAGNav />
        <Suspense fallback={<ProjectListLoading />}>
          <ProjectList currentProjectId={projectId} />
        </Suspense>
        <Suspense fallback={<ChatListLoading />}>
          <Chats />
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

const Chats: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { chats } = await getChats({
    userId: session.user.id,
    limit: 10,
  });
  return <ChatList chats={chats} />;
};
