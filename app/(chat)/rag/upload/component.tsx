import { RAGUploadForm } from "@/components/rag-upload-form";

export const RAGUploadComponent: React.FC = () => {
  return (
    <div className="flex flex-col h-full w-full max-w-2xl mx-auto p-6 px-4 pt-32">
      <div className="mb-8">
        <h1 className="text-3xl font-medium text-gray-900 dark:text-white mb-6">
          Upload RAG Resources
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-2">
          Upload a JSON file containing an array of URLs to process and add to
          your RAG knowledge base.
        </p>
      </div>

      <RAGUploadForm />
    </div>
  );
};
