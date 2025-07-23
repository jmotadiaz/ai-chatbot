import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth/auth-config";
import { RAGUploadForm } from "@/components/rag-upload-form";
import { SidebarProvider } from "@/app/providers";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sidebar } from "@/app/(chat)/sidebar";
import { Main } from "@/components/ui/main";
import { RAGUploadContainer } from "@/app/(chat)/rag/upload/component";

export default async function RAGUploadPage() {
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
        <RAGUploadContainer>
          <Suspense fallback={<div>Loading...</div>}>
            <RAGUploadForm />
          </Suspense>
        </RAGUploadContainer>
      </Main>
    </SidebarProvider>
  );
}
