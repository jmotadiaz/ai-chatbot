import { SidebarProvider } from "@/app/providers";

import { Sidebar } from "@/app/(chat)/sidebar";
import { RAGManager } from "@/app/(chat)/rag/component";
import { AuthCheck } from "@/components/auth-check";

export default async function RAGUploadPage() {
  return (
    <SidebarProvider>
      <AuthCheck />
      <Sidebar />
      <RAGManager />
    </SidebarProvider>
  );
}
