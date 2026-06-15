import React from "react";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { RAGManager } from "@/app/(chat)/rag/component";
import { withAuth, Authenticated } from "@/lib/features/auth/with-auth/hoc";

const RAGUploadPage: React.FC<Authenticated> = async ({ user }) => {
  return (
    <>
      <Sidebar user={user} />
      <RAGManager />
    </>
  );
};

export default withAuth(RAGUploadPage);
