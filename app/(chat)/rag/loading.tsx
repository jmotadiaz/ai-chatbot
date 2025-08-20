import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sidebar } from "@/app/(chat)/sidebar";
import { Main } from "@/components/ui/main";
import { RAGUploadComponent } from "@/app/(chat)/rag/component";

export default function Loading() {
  return (
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
      <RAGUploadComponent />
    </Main>
  );
}
