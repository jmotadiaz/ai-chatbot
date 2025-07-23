import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ProjectForm } from "@/components/project-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Main } from "@/components/ui/main";

const Loading: React.FC = async () => {
  return (
    <Main>
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
  );
};

export default Loading;
