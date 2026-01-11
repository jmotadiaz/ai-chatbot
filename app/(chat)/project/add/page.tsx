import { Suspense } from "react";
import { ProjectForm } from "@/components/project/form";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { NewChatHeader } from "@/components/chat/new";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";

export default async function NewProject() {
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
