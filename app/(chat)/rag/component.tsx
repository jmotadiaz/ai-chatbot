import { Suspense } from "react";
import { RAGUploadForm } from "@/components/rag-upload-form";
import { RAGTabs } from "@/components/rag-tabs";
import { Resources } from "@/app/(chat)/rag/resources";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";

export interface RAGManagerProps {
  withResources?: boolean;
}

export const RAGManager: React.FC<RAGManagerProps> = async ({
  withResources = true,
}) => {
  return (
    <>
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChat />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <div className="flex flex-col h-full w-full max-w-4xl mx-auto p-6 px-4 pt-28">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white mb-6">
          Manage RAG Resources
        </h1>

        <RAGTabs
          upload={<RAGUploadForm />}
          resources={
            withResources ? (
              <Suspense fallback={null}>
                <Resources />
              </Suspense>
            ) : null
          }
        />
      </div>
    </>
  );
};
