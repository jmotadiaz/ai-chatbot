import { Suspense } from "react";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ProjectForm } from "@/components/project/form";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { NewChatHeader } from "@/components/chat/new";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { withAuth, Authenticated } from "@/lib/features/auth/with-auth/hoc";

const NewProject: React.FC<Authenticated> = async ({ user }) => {
  return (
    <>
      <div className="h-svh flex flex-col justify-center w-full stretch">
        <Sidebar user={user} />
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
      </div>
    </>
  );
};

export default withAuth(NewProject);
