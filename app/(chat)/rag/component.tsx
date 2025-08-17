import { redirect } from "next/navigation";
import { RAGResources } from "@/components/rag-resources";
import { RAGUploadForm } from "@/components/rag-upload-form";
import { RAGTabs } from "@/components/rag-tabs";
import { getUniqueResourceTitlesByUserId } from "@/lib/db/queries";
import { auth } from "@/lib/auth/auth-config";

export const RAGUploadComponent: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const resources = await getUniqueResourceTitlesByUserId(session.user.id);

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto p-6 px-4 pt-32">
      <div className="mb-6">
        <h1 className="text-3xl font-medium text-gray-900 dark:text-white mb-6">
          Manage RAG Resources
        </h1>
      </div>

      <RAGTabs
        upload={<RAGUploadForm />}
        resources={<RAGResources resources={resources} />}
      />
    </div>
  );
};
