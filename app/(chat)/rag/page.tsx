import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { RAGManager } from "@/app/(chat)/rag/component";
import { withAuth, AuthenticatedPage } from "@/lib/features/auth/with-auth";
import React from "react";

const RAGUploadPage: React.FC<AuthenticatedPage> = async () => {
  return (
    <>
      <Sidebar />
      <RAGManager />
    </>
  );
}

export default withAuth(RAGUploadPage);
