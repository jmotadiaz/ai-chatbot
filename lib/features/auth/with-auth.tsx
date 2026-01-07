import { auth } from "@/lib/features/auth/auth-config";
import { Session } from "next-auth";
import { redirect } from "next/navigation";
import React from "react";

export interface AuthenticatedPage {
  user: NonNullable<Session["user"]>;
}

export function withAuth<P extends object>(
  Component: React.ComponentType<P & AuthenticatedPage>
) {
  return async function WithAuth(props: P) {
    const session = await auth();

    if (!session?.user) {
      redirect("/login");
    }

    return <Component {...props} user={session.user} />;
  };
}
