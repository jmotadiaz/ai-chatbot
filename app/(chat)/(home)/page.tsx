import React from "react";
import { redirect } from "next/navigation";
import {
  withAuth,
  type Authenticated,
} from "@/lib/features/auth/with-auth/hoc";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ChatHomeComponent } from "@/app/(chat)/(home)/component";

export interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const Page: React.FC<PageProps & Authenticated> = async ({
  searchParams,
  user,
}) => {
  const { chatId } = await searchParams;

  if (chatId) {
    redirect(`/${chatId}`);
  }

  return (
    <>
      <Sidebar user={user} />
      <ChatHomeComponent />
    </>
  );
};

export default withAuth(Page);
