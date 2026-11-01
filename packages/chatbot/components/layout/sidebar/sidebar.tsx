import React, { Suspense } from "react";
import { User } from "next-auth";
import { config } from "config";
import { SidebarContainer } from "@/components/layout/sidebar/container";
import { SidebarContent } from "@/components/layout/sidebar/content";
import { SidebarFooter } from "@/components/layout/sidebar/footer";
import {
  ProjectList,
  ProjectListLoading,
} from "@/components/layout/sidebar/project-list";
import type { ChatsSectionProps } from "@/components/layout/sidebar/chat-list";
import {
  ChatsSection,
  ChatsSectionLoading,
} from "@/components/layout/sidebar/chat-list";
import { UserMenu } from "@/components/layout/sidebar/user-menu";
import { RAGNav } from "@/components/layout/sidebar/rag-nav";
import { HubNav } from "@/components/layout/sidebar/hub-nav";
import {
  AgentCodeSection,
  AgentCodeSectionLoading,
} from "@/components/layout/sidebar/agent-code-section";
import { getCodingAgentProjects } from "@/lib/features/code/actions";
import { getChats } from "@/lib/features/chat/queries";
import { Authenticated } from "@/lib/features/auth/with-auth/hoc";

/** Chats shown in the sidebar list; the full history lives in `/chat/history`. */
const SIDEBAR_CHATS_LIMIT = 10;

export interface SidebarProps extends Authenticated {
  projectId?: string | null | undefined;
  chatId?: string | null | undefined;
}

export const Sidebar: React.FC<SidebarProps> = ({
  projectId,
  chatId,
  user,
}) => {
  return (
    <SidebarContainer>
      <SidebarContent>
        <div className="flex flex-col gap-1">
          <HubNav />
          <RAGNav />
          <Suspense fallback={<AgentCodeSectionLoading className="my-0 mt-4" />}>
            <AgentCodeProjects />
          </Suspense>
          {/* One boundary for both lists: resolving them separately shifts the
              projects list down when the chats above arrive, which moves the
              target under the pointer. */}
          <Suspense
            fallback={
              <>
                <ChatsSectionLoading className="my-0 mt-4" />
                <ProjectListLoading className="my-0 mt-4" />
              </>
            }
          >
            <Chats chatId={chatId} className="my-0 mt-4" user={user} />
            <ProjectList
              className="my-0 mt-4"
              currentProjectId={projectId}
              chatId={chatId}
              user={user}
            />
          </Suspense>
        </div>
      </SidebarContent>
      <SidebarFooter>
        <Suspense fallback={null}>
          <UserMenu user={user} />
        </Suspense>
      </SidebarFooter>
    </SidebarContainer>
  );
};

interface ChatsProps extends Omit<ChatsSectionProps, "chats"> {
  user: User;
}

const AgentCodeProjects: React.FC = async () => {
  if (!config.codingAgentEnabled()) return null;
  const projects = await getCodingAgentProjects();
  return <AgentCodeSection projects={projects} />;
};

const Chats: React.FC<ChatsProps> = async ({ chatId, className, user }) => {
  const { chats } = await getChats({
    userId: user.id!,
    limit: SIDEBAR_CHATS_LIMIT,
  });
  return <ChatsSection chats={chats} chatId={chatId} className={className} />;
};
