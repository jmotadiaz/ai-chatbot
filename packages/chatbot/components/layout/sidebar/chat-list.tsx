import type { ClassValue } from "clsx";
import { ArrowRight, MessageCircle, MessageCircleDashed } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { type Chat } from "@/lib/features/chat/types";
import { ChatListItem } from "@/components/layout/sidebar/chat-list-item";
import { SidebarSectionTitle } from "@/components/layout/sidebar/section-title";
import { buttonVariants } from "@/components/ui/button";
import ChatLink from "@/components/chat/link";
import { NewChatLink } from "@/components/chat/new";

export interface ChatListProps {
  chats: Chat[];
  className?: ClassValue;
  chatId?: string | null | undefined;
}

/**
 * The chats of a single list. Used by the root "Chats" section and by each
 * expanded project, so it renders no header: the section header belongs to
 * `ChatsSection` alone.
 */
export const ChatList: React.FC<ChatListProps> = ({
  chats,
  className,
  chatId,
}) => {
  if (!chats.length) return null;

  return (
    <div
      className={cn("space-y-3", className)}
      role="list"
      aria-label="Chat history"
    >
      {chats.map((chat) => (
        <ChatListItem
          key={chat.id}
          id={chat.id}
          title={chat.title}
          pinned={chat.pinned}
          active={chat.id === chatId}
        />
      ))}
    </div>
  );
};

export type ChatsSectionProps = ChatListProps;

/**
 * Root "Chats" section: header with the two global new-chat actions, the
 * latest chats, and the way into the full history. The header renders even
 * when the user has no root chats, so the actions stay reachable. The actions
 * are always global (they never follow the current context), which is why they
 * live here and not in the project lists.
 */
export const ChatsSection: React.FC<ChatsSectionProps> = ({
  chats,
  className,
  chatId,
}) => {
  return (
    <div className={cn("my-4", className)}>
      <div
        className="flex items-center justify-between pr-1"
        data-testid="chats-section-header"
      >
        <NewChatLink title="New chat">
          <SidebarSectionTitle className="mb-0 transition-colors hover:text-zinc-700 dark:hover:text-zinc-100">
            Chats <MessageCircle className="h-4 w-4 ml-3" />
          </SidebarSectionTitle>
        </NewChatLink>
        <div
          className="flex items-center gap-1"
          data-testid="chats-section-actions"
        >
          <NewChatLink
            temporary
            label="New temporary chat"
            className={buttonVariants({ variant: "icon", size: "icon" })}
          >
            <MessageCircleDashed className="h-4 w-4" />
          </NewChatLink>
        </div>
      </div>
      {chats.length ? (
        <>
          <ChatList chats={chats} chatId={chatId} />
          <ChatLink
            href="/chat/history"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mt-4 ml-1 transition-colors"
          >
            See all
            <ArrowRight className="w-3 h-3" />
          </ChatLink>
        </>
      ) : (
        <p className="ml-1 text-sm text-muted-foreground">No chats yet</p>
      )}
    </div>
  );
};

export const ChatsSectionLoading: React.FC<{ className?: ClassValue }> = ({
  className,
}) => {
  return (
    <div className={cn("my-4", className)}>
      <div className="flex items-center justify-between pr-1 mb-4">
        <SidebarSectionTitle className="mb-0">Chats</SidebarSectionTitle>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="flex" key={index}>
            <div className="h-5 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse flex-1 mr-3" />
            <div className="h-4 w-4 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
};
