import { ProjectForm } from "@/components/project-form";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChatHeader } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sidebar } from "@/components/sidebar";

const Loading: React.FC = () => {
  return (
    <>
      <Sidebar />
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChatHeader />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <ProjectForm />
    </>
  );
};

export default Loading;
