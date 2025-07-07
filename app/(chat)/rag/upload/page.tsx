import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth-config";
import { RAGUploadForm } from "@/components/rag-upload-form";
import { SidebarProvider } from "@/app/providers";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sidebar } from "@/app/(chat)/sidebar";

export default async function RAGUploadPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <SidebarProvider>
      <div className="h-svh flex flex-col justify-center w-full stretch">
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
        <div className="flex flex-col h-full w-full max-w-2xl mx-auto p-6 px-4 pt-20">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Upload RAG Resources
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              Upload a JSON file containing an array of URLs to process and add
              to your RAG knowledge base.
            </p>
          </div>

          <Suspense fallback={<div>Loading...</div>}>
            <RAGUploadForm />
          </Suspense>
        </div>
      </div>
    </SidebarProvider>
  );
}
