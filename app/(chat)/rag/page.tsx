import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { RAGManager } from "@/app/(chat)/rag/component";
import { auth } from "@/lib/features/auth/auth-config";

export default async function RAGUploadPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <Sidebar />
      <RAGManager />
    </>
  );
}
