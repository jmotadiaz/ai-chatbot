import { RAGUploadComponent } from "@/app/(chat)/rag/upload/component";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
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
      <RAGUploadComponent />
    </Main>
  );
};

export default Loading;
