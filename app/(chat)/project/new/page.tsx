import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProjectForm } from "@/components/project-form";
import { Sidebar, SidebarContent, SidebarFooter } from "@/components/sidebar";
import { ChatList } from "@/components/chat-list";
import { UserMenu } from "@/components/user-menu";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProjectList } from "@/components/project-list";
import { SidebarProvider } from "../../../providers";
import { getChats } from "../../../../lib/db/queries";

const NewProjectPage: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { chats } = await getChats({
    userId: session.user.id,
    limit: 10,
  });

  return (
    <SidebarProvider>
      <div className="h-svh flex flex-col justify-center w-full stretch">
        <Sidebar>
          <Suspense fallback={null}>
            <SidebarContent>
              <ProjectList />
              <ChatList chats={chats} />
            </SidebarContent>
            <SidebarFooter>
              <UserMenu />
            </SidebarFooter>
          </Suspense>
        </Sidebar>
        <Header>
          <div className="flex flex-row items-center gap-6 shrink-0">
            <Logo />
            <NewChat />
          </div>
          <div className="flex flex-row items-center gap-2 shrink-0">
            <ThemeToggle />
          </div>
        </Header>
        <ProjectForm />
      </div>
    </SidebarProvider>
  );
};

export default NewProjectPage;
