import React from "react";
import Chat from "@/components/chat";
import { Sidebar, SidebarContent, SidebarFooter } from "@/components/sidebar";
import { UserMenu } from "@/components/user-menu";
import { ChatList } from "@/components/chat-list";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { ModelPicker } from "@/components/model-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { NewChat } from "@/components/new-chat";
import { ProjectList } from "@/components/project-list";
import { Message } from "@/lib/db/schema";
import { defaultTemperature, defaultTopP, modelID } from "@/lib/ai/providers";
import {
  getChatById,
  getChats,
  getMessagesByChatId,
  getProjectById,
} from "@/lib/db/queries";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Attachment, UIMessage } from "ai";
import { ChatProvider, SidebarProvider } from "../../providers";
import { defaultMetaPrompt } from "../../../lib/ai/prompts";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

const ChatPage: React.FC<ChatPageProps> = async ({ params }) => {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const chat = await getChatById(id);

  if (!chat) {
    redirect("/");
  }

  if (chat.userId !== session.user.id) {
    redirect("/");
  }

  const messages = await getMessagesByChatId(id);

  const { chats } = await getChats({
    userId: session.user.id,
    limit: 10,
    ...(chat.projectId !== null && {
      projectId: chat.projectId,
    }),
  });

  const project = chat.projectId
    ? await getProjectById(chat.projectId ?? "")
    : null;

  const metaPrompt = project ? project.metaPrompt : defaultMetaPrompt;

  // Convert to UI messages format
  const initialMessages = convertToUIMessages(messages);

  return (
    <ChatProvider
      selectedModel={chat.defaultModel as modelID}
      temperature={chat.defaultTemperature ?? defaultTemperature}
      topP={chat.defaultTopP ?? defaultTopP}
      chatId={id}
      metaPrompt={metaPrompt}
      initialMessages={initialMessages}
    >
      <SidebarProvider>
        <div className="h-svh flex flex-col justify-center w-full stretch">
          <Sidebar>
            <SidebarContent>
              <ProjectList />
              <ChatList chats={chats} />
            </SidebarContent>
            <SidebarFooter>
              <UserMenu />
            </SidebarFooter>
          </Sidebar>
          <Header>
            <div className="flex flex-row items-center gap-6 shrink-0">
              <Logo />
              <NewChat />
              <ModelPicker />
            </div>
            <div className="flex flex-row items-center gap-2 shrink-0">
              <ThemeToggle />
            </div>
          </Header>
          <Chat />
        </div>
      </SidebarProvider>
    </ChatProvider>
  );
};

export default ChatPage;

function convertToUIMessages(messages: Array<Message>): Array<UIMessage> {
  return messages.map((message) => ({
    id: message.id,
    parts: message.parts as UIMessage["parts"],
    role: message.role as UIMessage["role"],
    // Note: content will soon be deprecated in @ai-sdk/react
    content: "",
    createdAt: message.createdAt,
    experimental_attachments: (message.attachments as Array<Attachment>) ?? [],
  }));
}
