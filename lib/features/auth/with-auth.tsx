import { Session } from "next-auth";
import { redirect } from "next/navigation";
import React from "react";
import { auth } from "@/lib/features/auth/auth-config";

export interface Authenticated {
  user: NonNullable<Session["user"]>;
}

export function withAuth<P extends object>(
  Component: React.ComponentType<P & Authenticated>
) {
  async function WithAuth(props: P) {
    const session = await auth();

    if (!session?.user) {
      redirect("/login");
    }

    return <Component {...props} user={session.user} />;
  }

  return WithAuth as React.ComponentType<P>;
}
