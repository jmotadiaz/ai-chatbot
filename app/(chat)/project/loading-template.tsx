import { Suspense } from "react";
import { ProjectForm } from "@/components/project/form";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { NewChatHeader } from "@/components/chat/new";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { SidebarContainer } from "@/components/layout/sidebar/container";

export const LoadingTemplate: React.FC = () => {
  return (
    <>
      <SidebarContainer />
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChatHeader />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <div className="h-svh flex flex-col justify-center w-full stretch">
        <Suspense fallback={null}>
          <ProjectForm />
        </Suspense>
      </div>
    </>
  );
};
