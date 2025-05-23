import Chat from "@/components/chat";
import Sidebar from "@/components/sidebar";
import { ChatList } from "@/components/chat-list";
import { Header } from "@/components/header";
import { ChatProvider, SidebarProvider } from "../../providers";
import { Logo } from "@/components/logo";
import { ModelPicker } from "@/components/model-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Attachment, UIMessage } from "ai";
import { Message } from "../../../lib/db/schema";
import { NewChat } from "../../../components/new-chat";

interface PageProps {
  params: {
    id: string;
  };
}

export default async function ChatPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  try {
    // Fetch chat data
    const chat = await getChatById({ id });

    // Verify this chat belongs to the current user
    if (chat.userId !== session.user.id) {
      redirect("/");
    }

    // Fetch messages for this chat
    const messages = await getMessagesByChatId({ id });

    // Convert to UI messages format
    const initialMessages = convertToUIMessages(messages);

    return (
      <ChatProvider initialMessages={initialMessages}>
        <SidebarProvider>
          <Sidebar>
            <ChatList />
          </Sidebar>
          <div className="h-dvh flex flex-col justify-center w-full stretch">
            <Header>
              <div className="flex flex-row items-center gap-6 shrink-0">
                <Logo />
                <ModelPicker />
                <NewChat />
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
  } catch (error) {
    console.error("Error loading chat:", error);
    redirect("/");
  }
}

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
