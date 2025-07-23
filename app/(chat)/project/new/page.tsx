import { redirect } from "next/navigation";
import { SidebarProvider } from "../../../providers";
import { Sidebar } from "../../sidebar";
import { auth } from "@/auth";
import { ProjectForm } from "@/components/project-form";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { Main } from "@/components/ui/main";

const NewProjectPage: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <SidebarProvider>
      <Main>
        <Sidebar />
        <Header.Container>
          <Header.Left>
            <Logo />
            <NewChat />
          </Header.Left>
          <Header.Right>
            <ThemeToggle />
          </Header.Right>
        </Header.Container>
        <ProjectForm />
      </Main>
    </SidebarProvider>
  );
};

export default NewProjectPage;
