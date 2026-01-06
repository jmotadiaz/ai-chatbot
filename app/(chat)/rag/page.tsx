import { Sidebar } from "@/app/(chat)/sidebar";
import { RAGManager } from "@/app/(chat)/rag/component";
import { AuthCheck } from "@/components/auth/check";

export default async function RAGUploadPage() {
  return (
    <>
      <AuthCheck />
      <Sidebar />
      <RAGManager />
    </>
  );
}
