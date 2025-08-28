import { SidebarProvider } from "@/app/providers";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sidebar } from "@/app/(chat)/sidebar";
import { RAGUploadComponent } from "@/app/(chat)/rag/component";
import { AuthCheck } from "@/components/auth-check";

export default async function RAGUploadPage() {
  return (
    <SidebarProvider>
      <AuthCheck />
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
    </SidebarProvider>
  );
}
