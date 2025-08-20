import { SidebarProvider } from "../../../providers";
import { Sidebar } from "../../sidebar";
import { ProjectForm } from "@/components/project-form";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { Main } from "@/components/ui/main";
import { AuthCheck } from "@/components/auth-check";

const NewProjectPage: React.FC = async () => {
  return (
    <SidebarProvider>
      <AuthCheck />
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
