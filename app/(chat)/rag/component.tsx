import { Suspense } from "react";
import { RAGUploadForm } from "@/components/rag-upload-form";
import { RAGTabs } from "@/components/rag-tabs";
import { Resources } from "@/app/(chat)/rag/resources";

export const RAGUploadComponent: React.FC = async () => {
  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto p-6 px-4 pt-28">
      <h1 className="text-3xl font-medium text-gray-900 dark:text-white mb-6">
        Manage RAG Resources
      </h1>

      <RAGTabs
        upload={<RAGUploadForm />}
        resources={
          <Suspense fallback={null}>
            <Resources />
          </Suspense>
        }
      />
    </div>
  );
};
