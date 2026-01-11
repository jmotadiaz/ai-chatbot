import { ProjectForm } from "@/components/project/form";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { NewChatHeader } from "@/components/chat/new";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { SidebarContainer } from "@/components/layout/sidebar/container";

const Loading: React.FC = () => {
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
      <ProjectForm />
    </>
  );
};

export default Loading;
