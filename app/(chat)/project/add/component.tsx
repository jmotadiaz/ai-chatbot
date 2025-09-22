import { Suspense } from "react";
import { ProjectForm } from "@/components/project-form";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChatHeader } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";

export const NewProject: React.FC = async () => {
  return (
    <>
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChatHeader />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <Suspense fallback={null}>
        <ProjectForm />
      </Suspense>
    </>
  );
};
