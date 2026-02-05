import { Suspense } from "react";
import { RAGUploadForm } from "@/components/rag/upload-form";
import { RAGTabs } from "@/components/rag/tabs";
import { Resources } from "@/app/(chat)/rag/resources";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { NewChatHeader } from "@/components/chat/new";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";

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
          <NewChatHeader />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <div className="flex flex-col h-full w-full max-w-4xl mx-auto p-6 px-4 pt-28">
        <Suspense fallback={null}>
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
        </Suspense>
      </div>
    </>
  );
};
